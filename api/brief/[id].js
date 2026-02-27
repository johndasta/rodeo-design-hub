import { VAULT_ROOT } from '../../server/config.js';
import { getBrief } from '../../server/briefs.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
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

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'server_error', message: String(e?.message || e) }));
  }
}
