import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_HOST, DEFAULT_PORT, VAULT_ROOT, localIps } from './config.js';
import { listBriefs, getBrief, addReview, addRequest, setStatus } from './briefs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function text(res, code, data, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { raw }; }
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(base)) return null;
  return p;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';

  const filePath = safeJoin(PUBLIC_DIR, pathname);
  if (!filePath) return text(res, 400, 'Bad path');

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.svg' ? 'image/svg+xml'
      : ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp'
      : 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    return text(res, 404, 'Not found');
  }
}

async function serveVaultFile(res, absPath) {
  try {
    const data = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
      : ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    text(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Serve brief sites (HTML + assets) from within the Vault so iframes work.
  // Routes:
  // - /brief-site/:id/:version/*  -> <briefRoot>/<version>/site/*
  // - /brief-site/:id/images/*   -> <briefRoot>/<version>/images/* (assumes currentVersion=v1 if not otherwise known)
  if (req.method === 'GET' && url.pathname.startsWith('/brief-site/')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const id = decodeURIComponent(parts[1] || '');

    const out = await getBrief(VAULT_ROOT, id);
    if (!out) return text(res, 404, 'Not found');

    // Legacy generated sites reference ../images/... which becomes /brief-site/:id/images/...
    if ((parts[2] || '') === 'images') {
      const rest = parts.slice(3).join('/');
      const version = out.brief.currentVersion || 'v1';
      const base = path.join(out.brief.briefRoot, version, 'images');
      const abs = safeJoin(base, rest);
      if (!abs) return text(res, 400, 'Bad path');
      return serveVaultFile(res, abs);
    }

    const version = decodeURIComponent(parts[2] || out.brief.currentVersion || 'v1');
    const rest = parts.slice(3).join('/') || 'index.html';

    const base = path.join(out.brief.briefRoot, version, 'site');
    const abs = safeJoin(base, rest);
    if (!abs) return text(res, 400, 'Bad path');
    return serveVaultFile(res, abs);
  }

  // Serve shared images referenced by brief sites.
  // Route: /brief-images/:id/:version/* -> maps to <briefRoot>/<version>/images/* OR <briefRoot>/images/*
  if (req.method === 'GET' && url.pathname.startsWith('/brief-images/')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const id = decodeURIComponent(parts[1] || '');
    const version = decodeURIComponent(parts[2] || 'v1');
    const rest = parts.slice(3).join('/');
    const out = await getBrief(VAULT_ROOT, id);
    if (!out) return text(res, 404, 'Not found');

    // Prefer versioned images, fallback to briefRoot/images
    const baseA = path.join(out.brief.briefRoot, version, 'images');
    const baseB = path.join(out.brief.briefRoot, 'images');
    let abs = safeJoin(baseA, rest);
    if (!abs) return text(res, 400, 'Bad path');

    try {
      await fs.access(abs);
    } catch {
      abs = safeJoin(baseB, rest);
    }

    if (!abs) return text(res, 400, 'Bad path');
    return serveVaultFile(res, abs);
  }

  // Redirect legacy relative image paths in generated sites.
  // Many v1 sites reference ../images/...; when served via /brief-site/... that becomes /images/... in-browser.
  // We serve /images/... as the current brief's images folder only when an id is present.
  // (Best practice is to update the generator to reference /brief-images/:id/:version/...)

  if (url.pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && url.pathname === '/api/briefs') {
        const briefs = await listBriefs(VAULT_ROOT);
        return json(res, 200, { vaultRoot: VAULT_ROOT, briefs });
      }

      const m = url.pathname.match(/^\/api\/brief\/(.+)$/);
      if (req.method === 'GET' && m) {
        const id = decodeURIComponent(m[1]);
        const out = await getBrief(VAULT_ROOT, id);
        if (!out) return json(res, 404, { error: 'not_found' });
        return json(res, 200, out);
      }

      const mr = url.pathname.match(/^\/api\/brief\/(.+)\/review$/);
      if (req.method === 'POST' && mr) {
        const id = decodeURIComponent(mr[1]);
        const out = await getBrief(VAULT_ROOT, id);
        if (!out) return json(res, 404, { error: 'not_found' });
        const body = await readBody(req);
        await addReview(out.brief.briefRoot, body);
        if (body.decision === 'Approved') await setStatus(out.brief.briefRoot, 'Approved');
        if (body.decision === 'Needs Changes') await setStatus(out.brief.briefRoot, 'Needs Changes');
        const updated = await getBrief(VAULT_ROOT, id);
        return json(res, 200, updated);
      }

      const mq = url.pathname.match(/^\/api\/brief\/(.+)\/request$/);
      if (req.method === 'POST' && mq) {
        const id = decodeURIComponent(mq[1]);
        const out = await getBrief(VAULT_ROOT, id);
        if (!out) return json(res, 404, { error: 'not_found' });
        const body = await readBody(req);
        await addRequest(out.brief.briefRoot, body);
        await setStatus(out.brief.briefRoot, 'Needs Review');
        const updated = await getBrief(VAULT_ROOT, id);
        return json(res, 200, updated);
      }

      return json(res, 404, { error: 'unknown_endpoint' });
    } catch (e) {
      return json(res, 500, { error: 'server_error', message: String(e?.message || e) });
    }
  }

  return serveStatic(req, res);
});

server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  const ips = localIps();
  console.log(`Rodeo Design Hub running:`);
  console.log(`- Local:   http://${DEFAULT_HOST}:${DEFAULT_PORT}`);
  console.log(`- App:     Rodeo Design Hub`);
  if (ips.length) console.log(`- LAN IPs: ${ips.map(ip => `http://${ip}:${DEFAULT_PORT}`).join('  ')}`);
  console.log(`Vault: ${VAULT_ROOT}`);
});
