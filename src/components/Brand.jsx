import { useId } from 'react';

// Radar logo. The sweep turns only while something is live (price feed, or the entry sequence),
// faster when the Pulse is higher; the blip lights up as the sweep passes it. Offline, it stops and dims.
// state: 'live' | 'off' | undefined (static)
export function RadarMark({ className = '', state, level }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const period = { calm: 6, active: 4, converge: 2.4, entry: 1.4 }[level] || 6;
  return (
    <svg className={`radar ${className} ${state ? `radar-${state}` : ''}`} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id={`sw${id}`} x1="512" y1="0" x2="800" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#62C6DE" stopOpacity=".05" /><stop offset="1" stopColor="#62C6DE" stopOpacity=".85" /></linearGradient>
        <radialGradient id={`fd${id}`} cx="512" cy="512" r="410" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset=".55" stopColor="#fff" stopOpacity="1" /></radialGradient>
        <mask id={`m${id}`}><rect width="1024" height="1024" fill={`url(#fd${id})`} /></mask>
      </defs>
      <g className="radar-sweep" style={{ animationDuration: `${period}s` }}><path d="M512 512L512 104A408 408 0 0 1 800.5 223.5Z" fill={`url(#sw${id})`} mask={`url(#m${id})`} /></g>
      <circle className="radar-ring" cx="512" cy="512" r="408" fill="none" stroke="#62C6DE" strokeWidth="18" />
      <circle className="radar-ring radar-ring-in" cx="512" cy="512" r="245" fill="none" stroke="#62C6DE" strokeWidth="15" opacity=".9" />
      <g className="radar-pod" transform="rotate(-39 512 515)" fill="none" stroke="#C9875A" strokeWidth="21" strokeLinejoin="round" strokeLinecap="round">
        <path d="M512 340C580 330 620 420 612 520C606 600 560 670 516 700C470 672 418 600 412 520C404 420 444 330 512 340Z" />
        <path d="M512 346L516 698M470 352C440 452 452 604 516 698M556 352C588 452 580 604 516 698" />
        <rect x="503" y="278" width="18" height="62" rx="6" />
      </g>
      <g className="radar-blip" style={{ animationDuration: `${period}s` }}><circle cx="795" cy="353" r="60" fill="#62C6DE" opacity=".22" /><circle cx="795" cy="353" r="26" fill="#62C6DE" /></g>
    </svg>
  );
}

export function Brand({ large = false, sub, state, level }) {
  return (
    <div className={`brand ${large ? 'brand-lg' : ''}`}>
      <RadarMark className="brand-mark" state={state} level={level} />
      <div className="brand-name">Cocoa<br />War Room{sub && <small>{sub}</small>}</div>
    </div>
  );
}
