import { Skeleton } from './ui/skeleton'
import './loading-surface.css'
import BrandMark from './BrandMark'
import { LoaderCircle } from 'lucide-react'
export default function LoadingSurface({ kind = 'dashboard', label = 'Loading workspace data…' }) {
  if (kind === 'session') return <div className="loading-surface loading-session" role="status" aria-live="polite"><div className="session-brand-emblem" aria-hidden="true"><span className="session-emblem-frame"><BrandMark size={34} /></span></div><div className="session-brand-copy"><strong>Averiq</strong><span>Your AI workspace</span></div><div className="session-loading-status"><LoaderCircle size={16} aria-hidden="true" /><span>{label}</span></div><div className="session-loading-track" aria-hidden="true"><span /></div><p className="session-loading-note">Preparing your workspace.</p></div>
  return <div className={`loading-surface loading-${kind}`} role="status" aria-live="polite"><span className="loading-label-copy">{label}</span><div className="loading-surface-head" aria-hidden="true"><Skeleton className="loading-heading" /><Skeleton className="loading-caption" /></div><div className="loading-surface-grid" aria-hidden="true">{Array.from({ length: kind === 'policy' ? 3 : 4 }, (_, index) => <div className="loading-surface-card" key={index}><Skeleton className="loading-stat-label" /><Skeleton className="loading-value" /><Skeleton className="loading-caption" /></div>)}</div><div className="loading-surface-panel" aria-hidden="true"><Skeleton className="loading-panel-title" />{Array.from({ length: 5 }, (_, index) => <div className="loading-table-row" key={index}><Skeleton /><Skeleton /><Skeleton /></div>)}</div></div>
}
export function InlineLoadingBar({ label = 'Updating…' }) {
  return <div className="inline-loading" role="status" aria-live="polite"><span>{label}</span><div className="loading-progress"><span /></div></div>
}
