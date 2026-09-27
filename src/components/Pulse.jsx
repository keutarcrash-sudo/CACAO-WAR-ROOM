import { Num } from './Num.jsx';

const PERIOD = { calm: '4.2s', active: '2.6s', converge: '1.5s' };

// Market Pulse, the signature: rings breathe at the pace of the activity, and one arc per
// component shows which inputs are really connected (lit) and which are not yet (dim).
export function Pulse({ pulse, onClick, size = 104 }) {
  const level = pulse?.level || 'calm';
  const comps = pulse?.components || [];
  const R = 46, C = 2 * Math.PI * R, gap = 6;
  const total = comps.reduce((s, c) => s + c.weight, 0) || 1;
  let offset = 0;
  return (
    <button className="pulse" data-level={level} style={{ '--pd': PERIOD[level], width: size, height: size }} onClick={onClick}
      aria-label={`Market Pulse ${pulse?.value ?? 'indisponible'}, ouvrir le détail`}
      data-info="Market Pulse|Activité du système : volatilité, mouvement, nouvelles, changements de scores. Ce n’est ni une prédiction ni une probabilité.">
      <svg className="pulse-arcs" viewBox="0 0 100 100" aria-hidden="true">
        {comps.map(c => {
          const len = (c.weight / total) * C - gap;
          const el = (
            <circle key={c.key} cx="50" cy="50" r={R} fill="none" strokeWidth="1.6" strokeLinecap="round"
              className={c.value == null ? 'arc off' : 'arc on'}
              style={{ '--v': c.value ?? 0 }}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />
          );
          offset += (c.weight / total) * C;
          return el;
        })}
      </svg>
      <span className="ring" /><span className="ring" /><span className="ring" />
      <span className="core" />
      <span className="pulse-val"><b>{pulse?.value == null ? '—' : <Num value={pulse.value} format={x => Math.round(x)} />}</b><small>pulse</small></span>
    </button>
  );
}

export function PulseDetail({ pulse }) {
  return (
    <>
      <p className="eyebrow">Signature du système</p>
      <h2 id="sheet-title">Market Pulse <span className="num faint">{pulse?.value ?? '—'}</span></h2>
      <p className="sheet-lead">Mesure l’activité autour du marché. Ce n’est ni une prédiction ni une probabilité de hausse ou de baisse.</p>
      <ul className="rows">
        {pulse?.components.map(c => (
          <li key={c.key} className={c.value == null ? 'is-off' : ''}>
            <span className="row-main">{c.label}<small>{c.detail}</small>
              {c.value != null && <span className="bar"><i style={{ width: `${c.value * 100}%` }} /></span>}
            </span>
            <span className="row-side num">{c.value == null ? 'non branché' : `/${c.weight}`}</span>
          </li>
        ))}
      </ul>
      <p className="fine">Couverture {pulse?.coverage}. Les composantes non branchées sont exclues du calcul, jamais estimées. 0–29 calme · 30–69 actif · 70+ convergence.</p>
    </>
  );
}
