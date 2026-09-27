import { Num } from './Num.jsx';

const PERIOD = { calm: '4.2s', active: '2.6s', converge: '1.5s' };

export function Pulse({ pulse, onClick }) {
  const level = pulse?.level || 'calm';
  return (
    <button className="pulse" data-level={level} style={{ '--pd': PERIOD[level] }} onClick={onClick} aria-label="Market Pulse, ouvrir le détail">
      <span className="ring" /><span className="ring" /><span className="ring" />
      <span className="core" />
      <span className="pulse-val">PULSE <b>{pulse?.value == null ? '—' : <Num value={pulse.value} format={x => Math.round(x)} />}</b></span>
    </button>
  );
}

export function PulseDetail({ pulse }) {
  return (
    <>
      <div className="label">Signature du système</div>
      <h2 id="sheet-title">Market Pulse · {pulse?.value ?? '—'}</h2>
      <p className="muted sheet-lead">Mesure l’activité autour du marché. Ce n’est ni une prédiction ni une probabilité de hausse ou de baisse.</p>
      <ul className="cl">
        {pulse?.components.map(c => (
          <li key={c.key} className={c.value == null ? 'miss' : ''}>
            <span className={c.value == null ? 'mk-miss' : 'mk-data'}>{c.value == null ? '○' : '◉'}</span>
            <span>{c.label}<small className="cl-sub">{c.detail}</small>
              {c.value != null && <span className="imp-bar"><i style={{ width: `${c.value * 100}%`, background: 'var(--data)' }} /></span>}
            </span>
            <span className="pts">/{c.weight}</span>
          </li>
        ))}
      </ul>
      <p className="disclaim">Couverture {pulse?.coverage} composantes. Les composantes non branchées sont exclues du calcul, jamais estimées. 0–29 calme · 30–69 actif · 70+ convergence.</p>
    </>
  );
}
