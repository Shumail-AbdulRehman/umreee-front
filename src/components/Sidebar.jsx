import { useState } from 'react'
import { pageGroups } from '../config/navigation'
import { isAdmin } from '../utils/permissions'

function getDisplayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
}

function getInitials(user) {
  return [user.first_name, user.last_name]
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

const iconPaths = {
  'prompt-studio': <><path d="M4 5h16v11H8l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></>,
  insights: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 16v-4m5 4V8m5 8v-6" /></>,
  'activity-log': <><path d="M3 12h4l3-6 4 12 3-6h4" /></>,
  violations: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  catalog: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h7M7 16h5" /></>,
  latency: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  spend: <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.5-1-1.5-1.5-3-1.5-2 0-3 1-3 2.5S10 13 12 13s3 1 3 2.5-1 2.5-3 2.5c-1.5 0-2.5-.5-3-1.5M12 6v12" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 6a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" /></>,
  inventory: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2 20a6 6 0 0 1 12 0m1-5a5 5 0 0 1 7 5" /></>,
  integrations: <><path d="M8 3v5M16 3v5M6 8h12v4a6 6 0 0 1-12 0V8Zm6 10v3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19 10 2 2-2 2-1 3-3 1-3 3-3-3-3-1-1-3-2-2 2-2 1-3 3-1 3-3 3 3 3 1 1 3Z" /></>,
  'dlp-policy': <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  'guardrail-policy': <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  'red-team': <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 13 2 2 4-5" /></>,
}

function NavIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name] || iconPaths.catalog}</svg>
}

export default function Sidebar({ page, onNavigate, user, onLogout, collapsed, onToggleCollapse }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const displayName = getDisplayName(user)
  const admin = isAdmin(user)
  const visibleGroups = pageGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.admin || admin),
  })).filter((group) => group.items.length)

  return (
    <aside className={`side ${mobileOpen ? 'mobile-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="brand">
        <div className="brand-mark">S</div>
        <div className="brand-name">Sentinel AI</div>
        <div className="brand-env">{import.meta.env.PROD ? 'production' : 'local'}</div>
        <button type="button" className="nav-collapse-toggle" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={collapsed ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'} /></svg>
        </button>
        <button type="button" className="btn mobile-menu-toggle" aria-expanded={mobileOpen} aria-controls="main-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? 'Close' : 'Menu'}</button>
      </div>

      <div className="side-navigation" id="main-navigation">
      {visibleGroups.map((group) => (
        <div className="nav-section" key={group.title}>
          <h2 className="nav-label">{group.title}</h2>
          {group.items.map((item) => (
            <button type="button" className={`nav-item ${page === item.key ? 'active' : ''}`} aria-label={item.label} title={collapsed ? item.label : undefined} aria-current={page === item.key ? 'page' : undefined} key={item.key} onClick={() => { onNavigate(item.key); setMobileOpen(false) }}>
              <span className="ic"><NavIcon name={item.key} /></span>
              <span className="nav-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="side-foot">
        <div className="user">
          <div className="avatar">{getInitials(user)}</div>
          <div className="user-copy">
            <div className="user-name">{displayName}</div>
            <div className="user-role">
              {[user.role, user.department, user.company?.name].filter(Boolean).join(' · ') || user.email}
            </div>
          </div>
        </div>
        <button type="button" className="btn logout-btn" onClick={onLogout} aria-label="Sign out" title={collapsed ? 'Sign out' : undefined}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 7l5 5-5 5M8 12h11" /></svg>
          <span>Sign out</span>
        </button>
      </div>
      </div>
    </aside>
  )
}
