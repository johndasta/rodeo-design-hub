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
  return ext === '.html' ? 'text/html; charset=utf-8'
    : ext === '.css' ? 'text/css; charset=utf-8'
    : ext === '.js' ? 'text/javascript; charset=utf-8'
    : ext === '.png' ? 'image/png'
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
    if (!id) {
      res.statusCode = 400;
      return res.end('Missing id');
    }

    const out = await getBrief(VAULT_ROOT, id);
    if (!out) {
      res.statusCode = 404;
      return res.end('Not found');
    }

    // /brief-site/:id/images/* -> <briefRoot>/<currentVersion>/images/*
    if ((segs[1] || '') === 'images') {
      const rest = segs.slice(2).join('/');
      const version = out.brief.currentVersion || 'v1';
      const base = path.join(out.brief.briefRoot, version, 'images');
      const abs = safeJoin(base, rest);
      if (!abs) {
        res.statusCode = 400;
        return res.end('Bad path');
      }
      const data = await fs.readFile(abs);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentTypeFor(abs));
      res.setHeader('Cache-Control', 'no-store');
      return res.end(data);
    }

    // /brief-site/:id/:version/* -> <briefRoot>/<version>/site/*
    const version = segs[1] || out.brief.currentVersion || 'v1';
    const rest = segs.slice(2).join('/') || 'index.html';

    const base = path.join(out.brief.briefRoot, version, 'site');
    const abs = safeJoin(base, rest);
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
