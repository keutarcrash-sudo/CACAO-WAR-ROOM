// Thin line icons drawn for the app (no emoji: they render differently on every phone).
const P = {
  price: <path d="M8 13V3M4 7l4-4 4 4" />,
  down: <path d="M8 3v10M4 9l4 4 4-4" />,
  vol: <path d="M1.5 8c1.5 0 1.5-4 3-4s1.5 8 3 8 1.5-8 3-8 1.5 4 3 4" />,
  pnl: <><circle cx="8" cy="8" r="5.5" /><path d="M9.8 5.8A2.6 2.6 0 0 0 6 7.2M6 8.8a2.6 2.6 0 0 0 3.8 1.4M5 7.3h3.5M5 8.7h3.5" /></>,
  source: <><circle cx="8" cy="10" r="1.3" /><path d="M5 7.2a4 4 0 0 1 6 0M3 5a7 7 0 0 1 10 0" /></>,
  MARKET: <path d="M1.5 12 5 8l3 2 6.5-7M10 3h4.5v4.5" />,
  LIQUIDITY: <><path d="M1.5 11.5h13" strokeDasharray="2 2" /><path d="M3 5c2 0 3 6 5 6s3-7 5-7" /></>,
  RISK: <><path d="M8 2 15 14H1L8 2Z" /><path d="M8 6.5v3.5" /><circle cx="8" cy="12" r=".4" /></>,
  TRADE: <><path d="M2 13.5h12" /><path d="M3 11l3-3 2.5 2 4.5-5.5" /></>,
  SYSTEM: <><circle cx="8" cy="10" r="1.3" /><path d="M5 7.2a4 4 0 0 1 6 0M3 5a7 7 0 0 1 10 0" /></>,
  status: <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" /></>,
  conf: <><circle cx="6" cy="8" r="4" /><circle cx="10" cy="8" r="4" /></>,
  fund: <><ellipse cx="8" cy="8" rx="3.8" ry="6" /><path d="M8 2v12" /></>,
  NEWS: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M5 6h6M5 8.5h6M5 11h3.5" /></>,
  FUNDAMENTALS: <><ellipse cx="8" cy="8" rx="3.8" ry="6" /><path d="M8 2v12" /></>,
  SETUP: <><circle cx="6" cy="8" r="4" /><circle cx="10" cy="8" r="4" /></>,
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  close: <path d="M4 4l8 8M12 4 4 12" />,
};

export function Icon({ name, size = 16, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] || P.SYSTEM}
    </svg>
  );
}
