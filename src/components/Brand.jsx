export function Brand({ large = false, sub }) {
  return (
    <div className={`brand ${large ? 'brand-lg' : ''}`}>
      <svg className="brand-mark" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <ellipse cx="13" cy="13" rx="7.2" ry="11" stroke="#62C6DE" strokeWidth="1.2" />
        <path d="M13 2.4v21.2" stroke="#62C6DE" strokeWidth="1" opacity=".6" />
        <path d="M7.4 8.5c3.4 1.6 7.8 1.6 11.2 0M7 13c3.6 1.7 8.4 1.7 12 0M7.4 17.5c3.4 1.6 7.8 1.6 11.2 0" stroke="#62C6DE" strokeWidth=".9" opacity=".45" />
      </svg>
      <div className="brand-name">Cocoa<br />War Room{sub && <small>{sub}</small>}</div>
    </div>
  );
}
