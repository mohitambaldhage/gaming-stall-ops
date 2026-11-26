import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStallServer } from '../server/server.mjs';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-api-test-'));
  return { dir, dbPath: path.join(dir, 'stall.db') };
}

test('HTTP API, CORS, QR SVG, and live SSE broadcast work end-to-end', async () => {
  const { dir, dbPath } = makeTempDb();
  const instance = createStallServer({ dbPath, port: 0, host: '127.0.0.1' });
  const { port } = await instance.start();
  const base = `http://127.0.0.1:${port}`;

  try {
    // Health & initial state
    const healthRes = await fetch(`${base}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);

    const stateRes = await fetch(`${base}/api/state`);
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.headers.get('access-control-allow-origin'), '*');
    const state = await stateRes.json();
    assert.equal(state.laptops.length, 7);

    // QR SVG endpoint
    const qrRes = await fetch(`${base}/api/qr?text=${encodeURIComponent(base)}`);
    assert.equal(qrRes.status, 200);
    assert.match(qrRes.headers.get('content-type'), /image\/svg\+xml/);
    const qrSvg = await qrRes.text();
    assert.match(qrSvg, /<svg/);

    // Connect SSE stream and verify live broadcast on +1 UPI payment
    const ac = new AbortController();
    const sseRes = await fetch(`${base}/api/events`, { signal: ac.signal });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const waitForEvent = async (predicate) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const idx = buffer.indexOf('\n\n');
        if (idx !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            const parsed = JSON.parse(dataLine.slice(6));
            if (predicate(parsed)) return parsed;
          }
          continue;
        }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      throw new Error('Timed out waiting for SSE event');
    };

    const initialEvent = await waitForEvent((p) => p.laptops?.length === 7);
    assert.equal(initialEvent.metrics.collectedTotal, 0);

    const payRes = await fetch(`${base}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'upi', slots: 1 }),
    });
    assert.equal(payRes.status, 201);

    const pushedEvent = await waitForEvent((p) => p.metrics?.collectedTotal === 149);
    assert.equal(pushedEvent.metrics.upiTotal, 149);

    ac.abort();

    // Static page serves cleanly
    const htmlRes = await fetch(`${base}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /Nov 28 Gaming Stall/);

    // External proxy origin appears in networkUrls for tunnel QR generation
    const tunnelStateRes = await fetch(`${base}/api/state`, {
      headers: {
        'X-Forwarded-Host': 'stall-demo.trycloudflare.com',
        'X-Forwarded-Proto': 'https',
      },
    });
    assert.equal(tunnelStateRes.status, 200);
    const tunnelState = await tunnelStateRes.json();
    assert.equal(tunnelState.meta.networkUrls[0], 'https://stall-demo.trycloudflare.com');
    assert.ok(tunnelState.meta.networkUrls.includes(`http://localhost:${port}`));

    // AI brief endpoint returns clean JSON even without API key (deterministic fallback)
    const aiRes = await fetch(`${base}/api/ai-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '' }),
    });
    assert.ok([200, 422].includes(aiRes.status));
    const aiBody = await aiRes.json();
    assert.equal(typeof aiBody.ok, 'boolean');
    assert.ok(aiBody.summary || aiBody.deterministic_brief || aiBody.message);
  } finally {
    await instance.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('STALL_PIN rejects unauthorized writes and accepts valid X-Stall-Pin', async () => {
  const { dir, dbPath } = makeTempDb();
  const instance = createStallServer({
    dbPath,
    port: 0,
    host: '127.0.0.1',
    stallPin: '2811',
  });
  const { port } = await instance.start();
  const base = `http://127.0.0.1:${port}`;

  try {
    const blocked = await fetch(`${base}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'cash', slots: 1 }),
    });
    assert.equal(blocked.status, 401);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.pinRequired, true);

    const allowed = await fetch(`${base}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Stall-Pin': '2811',
      },
      body: JSON.stringify({ method: 'cash', slots: 1 }),
    });
    assert.equal(allowed.status, 201);
    const allowedBody = await allowed.json();
    assert.equal(allowedBody.metrics.cashTotal, 149);
  } finally {
    await instance.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
