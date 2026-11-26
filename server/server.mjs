import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { CONFIG, PROJECT_ROOT, PUBLIC_DIR, getLocalNetworkUrls } from './config.mjs';
import { StallDatabase } from './db.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Stall-Pin');
}

async function readJsonBody(req, limitBytes = 2_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
  }
}

function runAiBrief({ dbPath, question }) {
  return new Promise((resolve) => {
    const agentDir = path.join(PROJECT_ROOT, 'agent');
    const scriptPath = path.join(agentDir, 'stall_analyst.py');
    if (!fs.existsSync(scriptPath)) {
      resolve({
        ok: false,
        reason: 'missing-script',
        message: 'Agent script not found in agent/stall_analyst.py.',
      });
      return;
    }

    const scriptArgs = ['stall_analyst.py'];
    if (question && question.trim()) {
      scriptArgs.push('ask', '--db', dbPath, '--json', question.trim());
    } else {
      scriptArgs.push('summary', '--db', dbPath, '--json');
    }

    const venvDir = path.join(CONFIG.dataDir, 'agent-venv');
    const venvPython = path.join(
      venvDir,
      process.platform === 'win32' ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'),
    );
    const bin = fs.existsSync(venvPython)
      ? venvPython
      : process.platform === 'win32'
        ? 'python'
        : 'python3';

    const child = spawn(bin, scriptArgs, {
      cwd: agentDir,
      env: { ...process.env, UV_PROJECT_ENVIRONMENT: venvDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        ok: false,
        reason: 'timeout',
        message: 'Antigravity agent timed out after 60s.',
      });
    }, 60_000);

    child.stdout.on('data', (d) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        reason: 'spawn-error',
        message: `Could not run Python agent (${bin}): ${err.message}`,
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ ok: code === 0 && parsed.ok !== false, ...parsed });
      } catch {
        resolve({
          ok: code === 0,
          message: stdout.trim() || stderr.trim() || `Agent exited with code ${code}`,
        });
      }
    });
  });
}

export function createStallServer({
  dbPath = path.join(CONFIG.dataDir, 'stall.db'),
  port = CONFIG.port,
  host = CONFIG.host,
  stallPin = CONFIG.stallPin,
  publicDir = PUBLIC_DIR,
} = {}) {
  const db = new StallDatabase(dbPath);
  const sseClients = new Set();
  let actualPort = port;

  function buildMeta(req) {
    const rawHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || `localhost:${actualPort}`).split(',')[0].trim();
    const proto = String(req?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const originUrl = `${proto}://${rawHost}`;
    const lanUrls = getLocalNetworkUrls(actualPort);
    const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(originUrl);
    const networkUrls = isLoopback ? lanUrls : [...new Set([originUrl, ...lanUrls])];
    return {
      mode: 'server',
      dbPath,
      dataDir: path.dirname(dbPath),
      pinRequired: Boolean(stallPin),
      networkUrls,
      originUrl,
    };
  }

  function buildStatePayload(req) {
    return {
      ...db.getSnapshot(),
      meta: buildMeta(req),
    };
  }

  function broadcastSnapshot() {
    if (sseClients.size === 0) return;
    const payload = `event: snapshot\ndata: ${JSON.stringify({
      ...db.getSnapshot(),
      meta: {
        mode: 'server',
        dbPath,
        dataDir: path.dirname(dbPath),
        pinRequired: Boolean(stallPin),
        networkUrls: getLocalNetworkUrls(actualPort),
      },
    })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  const keepaliveTimer = setInterval(() => {
    for (const res of sseClients) {
      try {
        res.write(': keepalive\n\n');
      } catch {
        sseClients.delete(res);
      }
    }
  }, 20_000);
  keepaliveTimer.unref?.();

  function requirePinIfConfigured(req, res) {
    if (!stallPin) return true;
    const supplied = String(req.headers['x-stall-pin'] || '').trim();
    if (supplied === stallPin) return true;
    sendJson(res, 401, {
      error: 'Operator PIN is required for write actions.',
      pinRequired: true,
    });
    return false;
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname.startsWith('/api/')) {
      setCorsHeaders(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          port,
          dataDir: path.dirname(dbPath),
          pinRequired: Boolean(stallPin),
          now: Date.now(),
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/qr') {
        const text = reqUrl.searchParams.get('text') || '';
        if (!text || text.length > 500) {
          sendJson(res, 400, { error: 'text query parameter is required (max 500 chars)' });
          return;
        }
        const svg = await QRCode.toString(text, {
          type: 'svg',
          margin: 1,
          width: 220,
          color: { dark: '#11161D', light: '#FFFFFF' },
        });
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(svg);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/state') {
        sendJson(res, 200, buildStatePayload(req));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`event: snapshot\ndata: ${JSON.stringify(buildStatePayload(req))}\n\n`);
        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      if (pathname.startsWith('/api/') && req.method !== 'GET') {
        if (!requirePinIfConfigured(req, res)) return;
      }

      if (req.method === 'PATCH' && pathname === '/api/settings') {
        const body = await readJsonBody(req);
        const snap = db.updateSettings(body);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/laptops') {
        const body = await readJsonBody(req);
        const snap = db.addLaptop(body);
        broadcastSnapshot();
        sendJson(res, 201, { ...snap, meta: buildMeta(req) });
        return;
      }

      const laptopMatch = pathname.match(/^\/api\/laptops\/([^/]+)$/);
      if (req.method === 'PATCH' && laptopMatch) {
        const body = await readJsonBody(req);
        const snap = db.updateLaptop(laptopMatch[1], body);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      const addGameMatch = pathname.match(/^\/api\/laptops\/([^/]+)\/games$/);
      if (req.method === 'POST' && addGameMatch) {
        const body = await readJsonBody(req);
        const snap = db.addGameToLaptop(addGameMatch[1], body);
        broadcastSnapshot();
        sendJson(res, 201, { ...snap, meta: buildMeta(req) });
        return;
      }

      const toggleGameMatch = pathname.match(/^\/api\/laptops\/([^/]+)\/games\/([^/]+)\/toggle$/);
      if (req.method === 'PATCH' && toggleGameMatch) {
        const snap = db.toggleGameInstalled(toggleGameMatch[1], toggleGameMatch[2]);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      const deleteGameMatch = pathname.match(/^\/api\/laptops\/([^/]+)\/games\/([^/]+)$/);
      if (req.method === 'DELETE' && deleteGameMatch) {
        const snap = db.removeGameFromLaptop(deleteGameMatch[1], deleteGameMatch[2]);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/sessions') {
        const body = await readJsonBody(req);
        const snap = db.startSession(body);
        broadcastSnapshot();
        sendJson(res, 201, { ...snap, meta: buildMeta(req) });
        return;
      }

      const extendMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/extend$/);
      if (req.method === 'POST' && extendMatch) {
        const body = await readJsonBody(req);
        const snap = db.extendSession(extendMatch[1], body);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      const endMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/end$/);
      if (req.method === 'POST' && endMatch) {
        const body = await readJsonBody(req);
        const snap = db.endSession(endMatch[1], body);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/payments') {
        const body = await readJsonBody(req);
        const snap = db.recordPayment(body);
        broadcastSnapshot();
        sendJson(res, 201, { ...snap, meta: buildMeta(req) });
        return;
      }

      const paperMatch = pathname.match(/^\/api\/payments\/([^/]+)\/paper-check$/);
      if (req.method === 'PATCH' && paperMatch) {
        const snap = db.togglePaymentPaperChecked(paperMatch[1]);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      const voidMatch = pathname.match(/^\/api\/payments\/([^/]+)\/void$/);
      if (req.method === 'POST' && voidMatch) {
        const snap = db.voidPayment(voidMatch[1]);
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/reset-day') {
        const snap = db.resetDay();
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/import') {
        const body = await readJsonBody(req);
        const snap = db.importSnapshot(body, { resetTransactions: true });
        broadcastSnapshot();
        sendJson(res, 200, { ...snap, meta: buildMeta(req) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/ai-brief') {
        const body = await readJsonBody(req);
        const result = await runAiBrief({
          dbPath,
          question: typeof body?.question === 'string' ? body.question : '',
        });
        sendJson(res, result.ok ? 200 : 422, result);
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Unknown API endpoint' });
        return;
      }

      // Static files from publicDir
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const resolvedPublic = path.resolve(publicDir);
      const resolvedPath = path.resolve(resolvedPublic, relPath);
      if (resolvedPath !== resolvedPublic && !resolvedPath.startsWith(resolvedPublic + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let targetFile = resolvedPath;
      if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
        targetFile = path.join(publicDir, 'index.html');
      }

      const ext = path.extname(targetFile).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(targetFile);
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': ext === '.html' || targetFile.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
      });
      res.end(content);
    } catch (err) {
      const code = err?.statusCode || (err?.message?.includes('not found') ? 404 : 400);
      sendJson(res, code, { error: err?.message || 'Internal server error' });
    }
  });

  function start() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        const addr = server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        actualPort = boundPort;
        resolve({ port: boundPort, dbPath, urls: getLocalNetworkUrls(boundPort) });
      });
    });
  }

  function stop() {
    clearInterval(keepaliveTimer);
    for (const res of sseClients) {
      try {
        res.end();
      } catch {
        // Ignore
      }
    }
    sseClients.clear();
    return new Promise((resolve) => {
      server.close(() => {
        db.close();
        resolve();
      });
    });
  }

  return { server, db, start, stop, broadcastSnapshot };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const instance = createStallServer();
  instance
    .start()
    .then(({ port, dbPath, urls }) => {
      console.log(`\nGaming Stall Ops running on port ${port}`);
      console.log(`Database (outside OneDrive): ${dbPath}`);
      console.log('Open on this laptop or phones on same Wi-Fi:');
      for (const u of urls) console.log(`  -> ${u}`);
      if (CONFIG.stallPin) {
        console.log('Operator PIN protection: ENABLED');
      }
    })
    .catch((err) => {
      console.error(`Failed to start server on port ${CONFIG.port}:`, err.message);
      process.exit(1);
    });
}
