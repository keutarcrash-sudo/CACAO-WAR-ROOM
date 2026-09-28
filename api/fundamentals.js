import { db } from '../lib/db/client.js';
import { addFundamental, deleteFundamental } from '../lib/db/repo.js';
import { loadFundamentals } from '../lib/services/fundamentals.js';
import { MANUAL } from '../lib/engines/fundamentals.js';
import { guarded, readJson, send, HttpError } from '../lib/http/respond.js';

export default guarded(async (req, res) => {
  const sql = await db();
  if (req.method === 'GET') return send(res, 200, await loadFundamentals(sql));
  if (req.method !== 'POST') return send(res, 405, { status: 'ERROR' });
  const b = await readJson(req);
  if (b.action === 'delete') {
    await deleteFundamental(sql, Number(b.id));
  } else if (b.action === 'add') {
    const def = MANUAL[b.metric];
    if (!def) throw new HttpError(400, 'Donnée inconnue');
    if (!def.regions.includes(b.region)) throw new HttpError(400, 'Région invalide');
    const value = Number(b.value), previous = Number(b.previous);
    if (!(value > 0) || !(previous > 0)) throw new HttpError(400, 'Les deux valeurs doivent être positives');
    const source = String(b.source || '').trim().slice(0, 120);
    if (!source) throw new HttpError(400, 'La source est obligatoire');
    const url = String(b.sourceUrl || '').trim();
    if (url && !/^https?:\/\//.test(url)) throw new HttpError(400, 'Lien de la source invalide');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date().toISOString().slice(0, 10);
    await addFundamental(sql, {
      metric: b.metric, region: b.region, value, previous, period: String(b.period || '').slice(0, 40) || null,
      dataTime: `${date}T12:00:00Z`, source, sourceUrl: url.slice(0, 500) || null, isEstimate: !!b.isEstimate, notes: String(b.notes || '').slice(0, 500) || null,
    });
  } else {
    throw new HttpError(400, 'Action inconnue');
  }
  send(res, 200, await loadFundamentals(sql));
});
