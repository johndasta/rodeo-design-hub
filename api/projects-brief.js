import fs from 'node:fs/promises';
import path from 'node:path';

import { VAULT_ROOT } from '../server/config.js';

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(base)) return null;
  return p;
}

function contentTypeFor(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  return ext === '.html' ? 'text/html; charset=utf-8'
    : ext === '.css' ? 'text/css; charset=utf-8'
    : ext === '.js' ? 'text/javascript; charset=utf-8'
    : ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : 'application/octet-stream';
}

// Serves raw HTML briefs (and assets) checked into data/Projects/...
// Rewrite sets query param: parts=<path...>
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end('Method not allowed');
    }

    const raw = req.query?.parts || '';
    const rel = String(raw).split('/').filter(Boolean).map(decodeURIComponent).join('/');
    if (!rel) {
      res.statusCode = 400;
      return res.end('Missing path');
    }

    const base = VAULT_ROOT; // points at /var/task/data on Vercel
    const abs = safeJoin(base, rel);
    if (!abs) {
      res.statusCode = 400;
      return res.end('Bad path');
    }

    const data = await fs.readFile(abs);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(abs));
    res.setHeader('Cache-Control', 'no-store');
    return res.end(data);
  } catch (e) {
    res.statusCode = 404;
    return res.end('Not found');
  }
}
