import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORT = Number(process.env.RODEO_DESIGN_HUB_PORT || 4174);
export const DEFAULT_HOST = process.env.RODEO_DESIGN_HUB_HOST || '127.0.0.1';

// Data root.
// IMPORTANT: In serverless (Vercel), `process.cwd()` may be the function bundle root
// (e.g. /var/task). Resolve relative to this module so `../data` stays correct.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_DATA_ROOT = path.join(__dirname, '..', 'data');

// Local-dev fallback (Obsidian Vault root via Google Drive shortcut)
const DEFAULT_VAULT = '/Users/agent/Library/CloudStorage/GoogleDrive-ops.daz813@gmail.com/.shortcut-targets-by-id/1Gr2uU6GpxaESaYoYpua94NbXRPlQMK1e/Vault/Vault';

export const VAULT_ROOT = process.env.RODEO_DESIGN_HUB_VAULT_ROOT ||
  (fs.existsSync(REPO_DATA_ROOT) ? REPO_DATA_ROOT : DEFAULT_VAULT);

export function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}
