import './loading-surface.css'

export default function LoadingSurface({ kind = 'dashboard', label = 'Loading workspace data…' }) {
  return <div className={`loading-surface loading-${kind}`} role="status" aria-live="polite">
    <div className="loading-surface-head"><div><span className="loading-skeleton loading-eyebrow" /><span className="loading-skeleton loading-heading" /></div><strong>{label}</strong></div>
    <div className="loading-progress" role="progressbar" aria-label={label}><span /></div>
    <div className="loading-surface-grid" aria-hidden="true">{Array.from({ length: kind === 'policy' ? 3 : 4 }, (_, index) => <div className="loading-surface-card" key={index}><span className="loading-skeleton loading-label" /><span className="loading-skeleton loading-value" /><span className="loading-skeleton loading-caption" /></div>)}</div>
    <div className="loading-surface-panel" aria-hidden="true"><span className="loading-skeleton loading-panel-title" /><span className="loading-skeleton loading-panel-line" /><span className="loading-skeleton loading-panel-line short" /></div>
  </div>
}

export function InlineLoadingBar({ label = 'Updating…' }) {
  return <div className="inline-loading" role="status" aria-live="polite"><span>{label}</span><div className="loading-progress" role="progressbar" aria-label={label}><span /></div></div>
}
