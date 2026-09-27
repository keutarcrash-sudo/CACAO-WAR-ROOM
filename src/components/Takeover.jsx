import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

// A critical event takes the screen, then gives it back. Rare by construction (importance 70+).
export function Takeover({ alert, onReview, onLater }) {
  const btn = useRef(null);
  useEffect(() => { if (alert) setTimeout(() => btn.current?.focus(), 80); }, [alert]);
  if (!alert) return null;
  return (
    <div className="takeover" role="alertdialog" aria-modal="true" aria-labelledby="tk-title">
      <div className="tk-card">
        <div className="tk-rule" />
        <div className="tk-body">
          <Icon name="RISK" size={34} className="tk-icon" />
          <p className="tk-kicker">Alerte critique</p>
          <h2 id="tk-title">{alert.title}</h2>
          {alert.message && <p>{alert.message}</p>}
          <p className="fine">Importance {alert.importance}/100 · {alert.source}</p>
        </div>
        <div className="tk-rule" />
        <div className="tk-actions">
          <button ref={btn} className="btn primary" onClick={onReview}>Revoir</button>
          <button className="btn" onClick={onLater}>Plus tard</button>
        </div>
      </div>
    </div>
  );
}
