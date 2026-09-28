export const TABS = [
  { id: 'warroom', label: 'War room', icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" opacity=".6" /><path d="M12 12 18 6" strokeLinecap="round" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></> },
  { id: 'market', label: 'Marché', icon: <><path d="M6 4v16M12 3v18M18 6v12" strokeLinecap="round" /><rect x="4.2" y="8" width="3.6" height="7" rx=".8" fill="#0E131B" /><rect x="10.2" y="6" width="3.6" height="6" rx=".8" fill="#0E131B" /><rect x="16.2" y="9" width="3.6" height="5" rx=".8" fill="#0E131B" /></> },
  { id: 'fund', label: 'Fondam.', icon: <path d="M5 5.5h14M6.5 8h11M8.5 8v10M12 8v10M15.5 8v10M6.5 18h11M5 20.5h14" strokeLinecap="round" /> },
  { id: 'intel', label: 'Intel', icon: <><path d="M12 5.2C11 4 9.4 3.6 8 4.2 6.4 4.4 5.3 5.7 5.3 7.2 3.9 7.9 3.3 9.6 4 11.1c-.9 1.3-.8 3.1.4 4.1.1 1.8 1.4 3.2 3.2 3.4.9 1.2 2.7 1.6 4.4.8M12 5.2c1-1.2 2.6-1.6 4-1 1.6.2 2.7 1.5 2.7 3 1.4.7 2 2.4 1.3 3.9.9 1.3.8 3.1-.4 4.1-.1 1.8-1.4 3.2-3.2 3.4-.9 1.2-2.7 1.6-4.4.8" strokeLinejoin="round" /><path d="M12 5.2v14.2" strokeLinecap="round" /><path d="M8.3 7.8c1.4.2 2.2 1.1 2.2 2.4M5.8 12.3c1.4-.5 2.9 0 3.6 1.3M16 7.8c-1.4.2-2.2 1.1-2.2 2.4M18.2 12.3c-1.4-.5-2.9 0-3.6 1.3" strokeLinecap="round" opacity=".6" /></> },
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
