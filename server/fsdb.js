import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export function makeId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

export async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, filePath);
}

export async function listDirs(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => path.join(root, e.name));
}
