import { Freshness } from './Freshness.jsx';

// A module that is not connected yet: says so, lists what it will watch and where the data will come from.
export function Pending({ eyebrow, title, phase, lead, rows }) {
  return (
    <>
      <section className="hero hero-compact">
        <div>
          <div className="label">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
          <div className="chg-row"><Freshness info={{ key: 'na', label: `Pas encore branché · ${phase}` }} /></div>
        </div>
      </section>
      <p className="lead">{lead}</p>
      <div className="glass card">
        {rows.map(r => (
          <div className="team-row" key={r.name}>
            <i className="dot fresh-na" aria-hidden="true" />
            <div>{r.name}<small>{r.source}</small></div>
            <span className="label">N/D</span>
          </div>
        ))}
      </div>
      <p className="foot">Aucune valeur n’est affichée tant que la vraie source n’est pas branchée.</p>
    </>
  );
}
