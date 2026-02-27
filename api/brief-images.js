import fs from 'node:fs/promises';
import path from 'node:path';

import { VAULT_ROOT } from '../server/config.js';
import { getBrief } from '../server/briefs.js';

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(base)) return null;
  return p;
}

function contentTypeFor(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  return ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : 'application/octet-stream';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end('Method not allowed');
    }

    const raw = req.query?.parts || '';
    const segs = String(raw).split('/').filter(Boolean).map(decodeURIComponent);

    const id = segs[0] || '';
    const version = segs[1] || 'v1';
    const rest = segs.slice(2).join('/');

    const out = await getBrief(VAULT_ROOT, id);
    if (!out) {
      res.statusCode = 404;
      return res.end('Not found');
    }

    const baseA = path.join(out.brief.briefRoot, version, 'images');
    const baseB = path.join(out.brief.briefRoot, 'images');

    let abs = safeJoin(baseA, rest);
    if (!abs) {
      res.statusCode = 400;
      return res.end('Bad path');
    }

    try { await fs.access(abs); } catch { abs = safeJoin(baseB, rest); }

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
    res.statusCode = 500;
    return res.end(String(e?.message || e));
  }
}
