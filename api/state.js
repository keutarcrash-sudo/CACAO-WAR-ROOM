import { db } from '../lib/db/client.js';
import * as repo from '../lib/db/repo.js';
import { guarded, query, readJson, send, HttpError } from '../lib/http/respond.js';
import { addPriceAlert } from '../lib/engines/pricealerts.js';

// Everything the War Room needs in one call, plus the "last visit" snapshot and alert acknowledgements.
export default guarded(async (req, res) => {
  const sql = await db();
  if (req.method === 'GET') {
    if (query(req).get('export') === '1') {
      return send(res, 200, await repo.exportAll(sql), { headers: { 'Content-Disposition': `attachment; filename="cocoa-war-room-${new Date().toISOString().slice(0, 10)}.json"` } });
    }
    const [trade, alerts, lastVisit, priceAlerts] = await Promise.all([repo.getActiveTrade(sql), repo.listAlerts(sql, 40), repo.getSetting(sql, 'last_visit'), repo.getSetting(sql, 'price_alerts', [])]);
    return send(res, 200, { status: 'OK', trade, alerts, lastVisit, priceAlerts, serverTime: Date.now() });
  }
  if (req.method !== 'POST') return send(res, 405, { status: 'ERROR' });
  const body = await readJson(req);
  if (body.action === 'visit') {
    const s = body.snapshot || {};
    const clean = Object.fromEntries(['price', 'atr', 'pnl', 'score', 'fund'].map(k => [k, Number.isFinite(s[k]) ? s[k] : null]));
    for (const k of ['sourceStatus', 'status', 'fundBias']) clean[k] = typeof s[k] === 'string' ? s[k].slice(0, 20) : null;
    clean.at = Date.now();
    if (clean.price != null) await repo.setSetting(sql, 'last_visit', clean);
    return send(res, 200, { status: 'OK' });
  }
  if (body.action === 'addPriceAlert' || body.action === 'deletePriceAlert') {
    let list = await repo.getSetting(sql, 'price_alerts', []);
    if (body.action === 'addPriceAlert') {
      try { list = addPriceAlert(list, { level: Number(body.level), note: body.note, price: Number(body.price) || null }); } catch (e) { throw new HttpError(400, e.message); }
    } else list = list.filter(a => a.id !== Number(body.id));
    await repo.setSetting(sql, 'price_alerts', list.slice(-20));
    return send(res, 200, { status: 'OK', priceAlerts: list });
  }
  if (body.action === 'ack') {
    await repo.acknowledgeAlert(sql, Number(body.id));
    return send(res, 200, { status: 'OK' });
  }
  throw new HttpError(400, 'Action inconnue');
});
