export function Brand({ large = false, sub }) {
  return (
    <div className={`brand ${large ? 'brand-lg' : ''}`}>
      <img className="brand-mark" src="/mark.svg" alt="" aria-hidden="true" />
      <div className="brand-name">Cocoa<br />War Room{sub && <small>{sub}</small>}</div>
    </div>
  );
}
