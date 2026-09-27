import { Freshness } from './Freshness.jsx';

// A module that is not connected yet: says so, lists what it will watch and where the data will come from.
export function Pending({ eyebrow, title, phase, lead, rows, children }) {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <Freshness info={{ key: 'na', label: `Pas encore branché · ${phase}` }} />
        <p className="lead">{lead}</p>
      </section>
      <ul className="rows">
        {rows.map(r => (
          <li key={r.name} className="is-off">
            <i className="dot fresh-na" aria-hidden="true" />
            <span className="row-main">{r.name}<small>{r.source}</small></span>
            <span className="row-side">N/D</span>
          </li>
        ))}
      </ul>
      {children}
      <p className="foot">Aucune valeur n’est affichée tant que la vraie source n’est pas branchée.</p>
    </>
  );
}
