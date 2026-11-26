import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
export const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

export function loadDotEnv(envPath = path.join(PROJECT_ROOT, '.env')) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function resolveDataDir() {
  if (process.env.STALL_DATA_DIR && process.env.STALL_DATA_DIR.trim()) {
    return path.resolve(process.env.STALL_DATA_DIR.trim());
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'gaming-stall-ops');
  }
  return path.join(os.homedir(), '.local', 'share', 'gaming-stall-ops');
}

export function getLocalNetworkUrls(port) {
  const urls = [`http://localhost:${port}`];
  const interfaces = os.networkInterfaces();
  for (const ifaceList of Object.values(interfaces)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return [...new Set(urls)];
}

loadDotEnv();

export const CONFIG = {
  port: Number(process.env.PORT || 4321),
  host: process.env.HOST || '0.0.0.0',
  dataDir: resolveDataDir(),
  stallPin: (process.env.STALL_PIN || '').trim(),
};
