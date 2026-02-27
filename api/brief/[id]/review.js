import { VAULT_ROOT } from '../../../server/config.js';
import { getBrief, addReview, setStatus } from '../../../server/briefs.js';

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end('Method not allowed');
    }

    const { id } = req.query || {};
    if (!id) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'missing_id' }));
    }

    const out = await getBrief(VAULT_ROOT, id);
    if (!out) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'not_found' }));
    }

    const body = await readJson(req);
    await addReview(out.brief.briefRoot, body);
    if (body.decision === 'Approved') await setStatus(out.brief.briefRoot, 'Approved');
    if (body.decision === 'Needs Changes') await setStatus(out.brief.briefRoot, 'Needs Changes');

    const updated = await getBrief(VAULT_ROOT, id);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(updated));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'server_error', message: String(e?.message || e) }));
  }
}
