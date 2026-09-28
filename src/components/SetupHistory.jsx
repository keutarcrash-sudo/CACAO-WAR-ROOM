import { useState } from 'react';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../lib/api.js';
import { dateShort, hhmm, num } from '../lib/format.js';

const ST = { NO_SETUP: 'Aucun setup', WATCHING: 'Surveillance', DEVELOPING: 'En formation', HIGH: 'Haute confluence', INVALIDATED: 'Invalidé' };
const ITEM = { fund: 'Fondamentaux', htf: 'Zone HTF', pool: 'Liquidité proche', sweep: 'Sweep', fvg: 'FVG', ob: 'Order block', disp: 'Displacement', bos: 'BOS / CHoCH', piv: 'Pivots', rej: 'Rejet', vol: 'Volume' };
const pct = x => (x == null ? '—' : `${x > 0 ? '+' : ''}${num(x, 1)} %`);
const hit = x => (x == null ? '—' : `${Math.round(x * 100)} %`);

// Phase 9: after each status change, what did the market do? Measured, never assumed.
export function SetupHistory() {
  const h = usePolling(api.history, 15 * 60e3);
  const [hz, setHz] = useState('d7');
  const d = h.data;
  const st = d?.stats?.[hz];
  return (
    <section>
      <header className="section-head"><h2>Mémoire des signaux</h2><span className="meta">ce que le marché a fait ensuite</span></header>
      <p className="empty">Chaque changement de statut est gardé avec le prix du moment. L’app mesure ensuite le mouvement dans le sens du setup, à 1, 3 et 7 jours.</p>
      {!d ? <p className="empty">{h.loading ? 'Chargement…' : 'Historique indisponible.'}</p> : (
        <>
          <div className="seg">{['d1', 'd3', 'd7'].map(k => <button key={k} aria-pressed={k === hz} onClick={() => setHz(k)}>{k.slice(1)} jour{k === 'd1' ? '' : 's'}</button>)}</div>
          {!st.enough && <p className="fine">Échantillon trop petit : {st.evaluated} mesure{st.evaluated > 1 ? 's' : ''} sur {st.total} signaux. Les chiffres deviennent parlants à partir d’une dizaine.</p>}
          {st.evaluated > 0 && (
            <>
              <p className="changed-sub">Par statut · mouvement moyen · taux de réussite</p>
              <ul className="rows compact">
                {Object.entries(st.byStatus).filter(([, g]) => g.n).map(([k, g]) => (
                  <li key={k}><span className="row-main">{ST[k]}<small>{g.n} mesure{g.n > 1 ? 's' : ''}</small></span><span className={`row-side ${g.avg > 0 ? 'up' : g.avg < 0 ? 'down' : ''}`}>{pct(g.avg)} · {hit(g.hit)}</span></li>
                ))}
              </ul>
              <p className="changed-sub">Par confirmation présente</p>
              <ul className="rows compact">
                {st.byItem.map(g => (
                  <li key={g.k}><span className="row-main">{ITEM[g.k] || g.k}<small>{g.n} mesure{g.n > 1 ? 's' : ''}</small></span><span className={`row-side ${g.avg > 0 ? 'up' : g.avg < 0 ? 'down' : ''}`}>{pct(g.avg)} · {hit(g.hit)}</span></li>
                ))}
              </ul>
            </>
          )}
          {d.rows.length > 0 && (
            <>
              <p className="changed-sub">Derniers signaux</p>
              <ul className="rows compact">
                {d.rows.slice(0, 15).map(r => (
                  <li key={r.id}>
                    <span className="row-main">{ST[r.status]} · {r.direction === 'SHORT' ? 'short' : 'long'} · {r.score}/15<small>{dateShort(r.at)} {hhmm(r.at)} · prix {num(r.price)} · 1 j {pct(r.outcome?.d1?.pct)} · 3 j {pct(r.outcome?.d3?.pct)} · 7 j {pct(r.outcome?.d7?.pct)}</small></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="fine">Mesuré sur les clôtures Daily, dans le sens du setup (positif = le marché est allé dans le sens attendu). Le passé ne garantit rien, mais il dit quelles confluences méritent ta confiance.</p>
    </section>
  );
}
