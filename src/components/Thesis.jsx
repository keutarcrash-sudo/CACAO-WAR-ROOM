import { BIAS } from '../pages/Fundamentals.jsx';
import { money } from '../lib/format.js';

// "Your thesis" told as a story: the bias, why, but…, and what would invalidate it.
export function Thesis({ fund, trade, go }) {
  const d = fund.data;
  if (!d) return null;
  const s = d.score, b = BIAS[s.bias];
  const byKey = Object.fromEntries(d.factors.map(f => [f.key, f]));
  const why = s.reasons.map(k => byKey[k]);
  const but = s.counters.map(k => byKey[k]);
  const missing = d.factors.filter(f => f.score == null);
  const sign = x => (x > 0 ? `+${x}` : `${x}`);

  return (
    <section className="thesis">
      <header className="section-head"><h2>Ta thèse</h2><button className="link" onClick={() => go('fund')}>Détail</button></header>
      <div className="thesis-head">
        <span className={`bias-num num ${b.cls}`}>{s.total == null ? '—' : sign(s.total)}</span>
        <span><span className={`bias-chip ${b.cls}`}>{b.label}</span><small className="meta">score fondamental · {s.coverage}/{s.of} facteurs</small></span>
      </div>

      <div className="thesis-block">
        <h4>Pourquoi</h4>
        {why.length ? <ul>{why.map(f => <li key={f.key}><i className="up">✓</i><span>{f.name}<small>{f.value}</small></span><b className="up num">{sign(f.score)}</b></li>)}</ul> : <p className="empty">Aucun facteur favorable dans les données disponibles.</p>}
      </div>
      <div className="thesis-block">
        <h4>Mais…</h4>
        {but.length ? <ul>{but.map(f => <li key={f.key}><i className="warn">!</i><span>{f.name}<small>{f.value}</small></span><b className="down num">{sign(f.score)}</b></li>)}</ul> : <p className="empty">Aucun contre-facteur détecté dans les données disponibles, ce qui ne veut pas dire qu’il n’y en a pas.</p>}
        {missing.length > 0 && <p className="fine">Non comptés faute de données : {missing.map(f => f.name).join(', ')}.</p>}
      </div>
      <div className="thesis-block">
        <h4>Ce qui l’invaliderait</h4>
        <ol className="chain">
          <li>Score fondamental à −3 ou moins<small>actuel {s.total == null ? 'N/D' : sign(s.total)}</small></li>
          <li>Stocks ICE en forte hausse<small>plus de +10 % sur 4 semaines</small></li>
          <li>Production révisée à la hausse<small>plus de +10 % sur la prévision précédente</small></li>
          <li>{trade.stop != null ? `Clôture Daily au-delà de ton stop ${money(trade.stop, trade.product.priceCurrency)}` : 'Clôture Daily sous ton invalidation (stop à définir)'}</li>
          <li className="end">Thèse invalidée</li>
        </ol>
      </div>
    </section>
  );
}
