import { db } from '../lib/db/client.js';
import { addNote, getActiveTrade, listJournal } from '../lib/db/repo.js';
import { guarded, readJson, send, HttpError } from '../lib/http/respond.js';

const QUESTIONS = ['why', 'thesis', 'saw', 'market', 'ai'];

export default guarded(async (req, res) => {
  const sql = await db();
  if (req.method === 'GET') return send(res, 200, { status: 'OK', journal: await listJournal(sql) });
  if (req.method !== 'POST') return send(res, 405, { status: 'ERROR' });
  const body = await readJson(req);
  const answers = Object.fromEntries(QUESTIONS.map(k => [k, String(body.answers?.[k] ?? '').slice(0, 4000)]).filter(([, v]) => v.trim()));
  if (!Object.keys(answers).length) throw new HttpError(400, 'Note vide');
  const trade = await getActiveTrade(sql);
  // the snapshot is sent by the client (what the user was looking at); keep only known numeric fields
  const s = body.snapshot || {};
  const snapshot = Object.fromEntries(['price', 'pnl', 'capital', 'avg', 'pulse'].map(k => [k, Number.isFinite(s[k]) ? s[k] : null]));
  snapshot.status = typeof s.status === 'string' ? s.status.slice(0, 40) : null;
  snapshot.cur = ['USD', 'GBP', 'EUR'].includes(s.cur) ? s.cur : null;
  const note = await addNote(sql, { positionId: trade.id, answers, snapshot });
  send(res, 200, { status: 'OK', note });
});
