import { spawn, spawnSync } from 'node:child_process';
import { CONFIG } from './config.mjs';

const port = CONFIG.port;

function hasCommand(cmd) {
  const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [cmd], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return probe.status === 0;
}

if (hasCommand('cloudflared')) {
  console.log(`Starting Cloudflare Quick Tunnel for http://localhost:${port}...`);
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: 'inherit',
  });
  proc.on('exit', (code) => process.exit(code ?? 0));
} else {
  console.log('`cloudflared` was not found on PATH.');
  console.log('Falling back to npx localtunnel (press Ctrl+C to stop)...');
  console.log('Tip: For an even faster tunnel without interstitial screens, install cloudflared:');
  console.log('  winget install --id Cloudflare.cloudflared -e\n');
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawn(npxBin, ['-y', 'localtunnel', '--port', String(port)], {
    stdio: 'inherit',
  });
  proc.on('exit', (code) => process.exit(code ?? 0));
}
