export const TABS = [
  { id: 'warroom', label: 'War room', icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" opacity=".6" /><path d="M12 12 18 6" strokeLinecap="round" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></> },
  { id: 'market', label: 'Marché', icon: <><path d="M6 4v16M12 3v18M18 6v12" strokeLinecap="round" /><rect x="4.2" y="8" width="3.6" height="7" rx=".8" fill="#0E131B" /><rect x="10.2" y="6" width="3.6" height="6" rx=".8" fill="#0E131B" /><rect x="16.2" y="9" width="3.6" height="5" rx=".8" fill="#0E131B" /></> },
  { id: 'fund', label: 'Fondam.', icon: <><ellipse cx="12" cy="12" rx="5.5" ry="9" /><path d="M12 3v18M7 8.5c3 1.2 7 1.2 10 0M6.6 13c3.2 1.3 7.6 1.3 10.8 0" opacity=".6" strokeLinecap="round" /></> },
  { id: 'intel', label: 'Intel', icon: <><path d="M4 19c2.5-7 5-12 8-12s5.5 5 8 12" strokeLinecap="round" /><path d="M8 19c1.3-3.6 2.6-6 4-6s2.7 2.4 4 6" opacity=".6" strokeLinecap="round" /><circle cx="12" cy="4" r="1.2" fill="currentColor" /></> },
  { id: 'trade', label: 'Trade', icon: <><path d="M3 17h18" strokeLinecap="round" /><path d="M4 14l4-4 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 6h3v3" strokeLinecap="round" /></> },
];

export function TabBar({ current, onChange, badge }) {
  const i = TABS.findIndex(t => t.id === current);
  return (
    <nav className="tabbar" aria-label="Sections">
      <div className="tabbar-in" style={{ '--ti': i }}>
        <span className="tab-ind" aria-hidden="true" />
        {TABS.map(t => (
          <button key={t.id} className="tab" aria-current={t.id === current ? 'page' : undefined} onClick={() => onChange(t.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
            {badge === t.id && <i className="tab-badge" aria-label="nouveaux événements" />}
          </button>
        ))}
      </div>
    </nav>
  );
}
