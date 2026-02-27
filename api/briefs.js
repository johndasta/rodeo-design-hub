import { VAULT_ROOT } from '../server/config.js';
import { listBriefs } from '../server/briefs.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end('Method not allowed');
    }

    const briefs = await listBriefs(VAULT_ROOT);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    return res.end(JSON.stringify({ vaultRoot: VAULT_ROOT, briefs }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'server_error', message: String(e?.message || e) }));
  }
}
