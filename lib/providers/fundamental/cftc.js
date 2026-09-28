// CFTC Commitments of Traders, disaggregated futures only, via the public Socrata API. Cocoa, ICE Futures U.S.
export const SOURCE = { name: 'CFTC COT', url: 'https://publicreporting.cftc.gov' };
const BASE = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json';
const COCOA_CODE = '073732';

async function query(where, fetchImpl) {
  const url = `${BASE}?$where=${encodeURIComponent(where)}&$order=${encodeURIComponent('report_date_as_yyyy_mm_dd DESC')}&$limit=170`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
  return res.json();
}

export async function fetchCot(fetchImpl = fetch) {
  let rows = await query(`cftc_contract_market_code='${COCOA_CODE}'`, fetchImpl);
  if (!Array.isArray(rows) || !rows.length) rows = await query("upper(market_and_exchange_names) like 'COCOA%ICE%'", fetchImpl);
  return summarizeCot(parseCot(rows));
}

// Field names differ slightly between datasets: find them by pattern rather than hard-coding.
function pick(row, re, avoid = /old|other|pct|chg|change|spread|conc/) {
  const keys = Object.keys(row).filter(k => re.test(k) && !avoid.test(k));
  const k = keys.find(x => x.endsWith('_all')) || keys[0];
  return k != null && row[k] != null ? Number(row[k]) : null;
}

export function parseCot(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('CFTC: aucune ligne pour le cacao');
  const name = rows[0].market_and_exchange_names || '';
  if (name && !/cocoa/i.test(name)) throw new Error(`CFTC: marché inattendu (${name})`);
  return rows.map(r => ({
    date: String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10),
    mmLong: pick(r, /^m_money_positions_long/), mmShort: pick(r, /^m_money_positions_short/),
    pmLong: pick(r, /^prod_merc_positions_long/), pmShort: pick(r, /^prod_merc_positions_short/),
    oi: pick(r, /^open_interest/),
  })).filter(r => r.date && r.mmLong != null && r.mmShort != null).sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeCot(rows) {
  if (rows.length < 20) throw new Error('CFTC: historique insuffisant');
  const hist = rows.slice(-156).map(r => ({ ...r, net: r.mmLong - r.mmShort }));
  const last = hist.at(-1), prev = hist.at(-2), prev4 = hist.at(-5) ?? hist[0];
  const below = hist.filter(r => r.net < last.net).length;
  return {
    date: last.date, market: 'Cocoa, ICE Futures U.S.',
    mmNet: last.net, mmLong: last.mmLong, mmShort: last.mmShort, openInterest: last.oi,
    commercialNet: last.pmLong != null && last.pmShort != null ? last.pmLong - last.pmShort : null,
    change1w: last.net - prev.net, change4w: last.net - prev4.net,
    percentile: Math.round((below / (hist.length - 1)) * 100), weeks: hist.length,
    recent: hist.slice(-12).map(r => ({ date: r.date, net: r.net })),
  };
}
