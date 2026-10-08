import { useState } from 'react'
import './insights.css'

const number = (value) => Number(value || 0).toLocaleString()
const dollars = (value) => value == null ? 'Unknown' : '$' + Number(value).toFixed(Number(value) < 1 && Number(value) > 0 ? 5 : 2)
const dayLabel = (date) => new Date(date.slice(0, 10) + 'T12:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })

function activityDays(series = []) {
  const days = new Map()
  for (const item of series) {
    const key = item.date.slice(0, 10)
    const day = days.get(key) || { date: key, allowed: 0, blocked: 0, other: 0 }
    if (item.status === 'allowed') day.allowed += item.count
    else if (item.status?.startsWith('blocked')) day.blocked += item.count
    else day.other += item.count
    days.set(key, day)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function Metric({ label, value, foot, tone = 'blue', href, trend = [] }) {
  const max = Math.max(1, ...trend)
  const points = trend.map((count, index) => `${index * 64 / Math.max(1, trend.length - 1)},${24 - count / max * 19}`).join(' ')
  return <div className={`insight-metric tone-${tone}`}><div className="insight-metric-top"><span>{label}</span><span className="insight-metric-dot" /></div>
    <div className="insight-metric-main"><strong>{value}</strong>{trend.length > 1 && <svg className="insight-sparkline" viewBox="0 0 64 28" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div><div className="insight-metric-bottom"><span>{foot}</span>{href && <a href={`#${href}`}>View <span aria-hidden="true">↗</span></a>}</div></div>
}

function BreakdownCard({ eyebrow, title, rows = [], href, empty = 'No violations in this period.' }) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return <section className="insight-card insight-breakdown"><div className="insight-card-heading"><div><span className="insight-eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>
    {rows.length ? <div className="insight-breakdown-list">{rows.slice(0, 5).map((row, index) => <div className="insight-breakdown-row" key={row.name}><div><span className="insight-rank">{String(index + 1).padStart(2, '0')}</span><span className="insight-breakdown-name">{row.name.replaceAll('_', ' ')}</span><strong>{number(row.count)}</strong></div><div className="insight-outcome-track"><span style={{ width: `${row.count / max * 100}%` }} /></div></div>)}</div> : <p className="insight-breakdown-empty">{empty}</p>}
    <a className="insight-card-footlink" href={href}>View details <span aria-hidden="true">↗</span></a></section>
}

function PeopleCard({ title, eyebrow, rows = [], mode }) {
  const max = Math.max(1, ...rows.map((row) => mode === 'spend' ? Number(row.cost_usd) : row.count))
  return <section className="insight-card insight-people"><div className="insight-card-heading"><div><span className="insight-eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>
    {rows.length ? <div className="insight-people-list">{rows.map((row, index) => { const value = mode === 'spend' ? Number(row.cost_usd) : row.count; return <div className="insight-person" key={row.name + index}><span className="insight-person-avatar">{row.name.slice(0, 1).toUpperCase()}</span><div className="insight-person-copy"><strong>{row.name}</strong><small>{mode === 'spend' ? `${number(row.runs)} runs` : 'Recorded incidents'}</small><div className="insight-person-track"><span style={{ width: `${value / max * 100}%` }} /></div></div><b>{mode === 'spend' ? dollars(row.cost_usd) : number(row.count)}</b></div> })}</div> : <p className="insight-breakdown-empty">{mode === 'spend' ? 'No recorded model spend yet.' : 'No users with violations.'}</p>}</section>
}

function CostTrend({ rows = [] }) {
  const values = rows.map((row) => Number(row.cost_usd))
  const max = Math.max(.00001, ...values)
  const points = values.map((value, index) => [28 + index * 664 / Math.max(1, values.length - 1), 190 - value / max * 143])
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
  const area = points.length ? `${line} L ${points.at(-1)[0]} 190 L ${points[0][0]} 190 Z` : ''
  return <section className="insight-card insight-cost-trend"><div className="insight-card-heading"><div><span className="insight-eyebrow">SPEND OVER TIME</span><h3>Daily estimated cost</h3><p>Known model charges for prompts submitted in the last seven days.</p></div><a href="#spend">Explore spend ↗</a></div>
    {points.length ? <div className="insight-cost-plot"><svg viewBox="0 0 720 210" preserveAspectRatio="none" role="img" aria-label="Daily estimated cost trend">{[47, 94, 141, 190].map((y) => <line key={y} x1="28" x2="692" y1={y} y2={y} className="insight-cost-grid" />)}<defs><linearGradient id="cost-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#748fe8" stopOpacity=".3" /><stop offset="100%" stopColor="#748fe8" stopOpacity="0" /></linearGradient></defs><path d={area} fill="url(#cost-fill)" /><path d={line} fill="none" stroke="#5175d5" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />{points.map(([x, y], index) => <circle key={rows[index].date} cx={x} cy={y} r="4" fill="#fff" stroke="#5175d5" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}</svg><div className="insight-cost-labels">{rows.map((row) => <span key={row.date} title={dollars(row.cost_usd)}>{dayLabel(row.date)}</span>)}</div></div> : <p className="insight-empty">No known model costs in this period.</p>}</section>
}

function RecentRuns({ runs = [] }) {
  const [filter, setFilter] = useState('all')
  const visible = runs.filter((run) => filter === 'all' || (filter === 'blocked' ? run.status?.startsWith('blocked') : filter === 'error' ? run.status?.endsWith('error') || run.status === 'interrupted' : run.status === filter))
  return <section className="insight-card insight-recent"><div className="insight-card-heading"><div><span className="insight-eyebrow">RECENT ACTIVITY</span><h3>Latest prompt runs</h3><p>Most recent {runs.length} runs from this seven-day period.</p></div><a href="#activity-log">Open activity log ↗</a></div>
    <div className="insight-recent-filters" aria-label="Filter recent runs">{[['all', 'All'], ['blocked', 'Blocked'], ['allowed', 'Allowed'], ['error', 'Errors']].map(([key, name]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{name}</button>)}</div>
    {visible.length ? <div className="insight-table-wrap"><table className="insight-table insight-recent-table"><thead><tr><th>When</th><th>User</th><th>Model</th><th>Status</th><th>Tokens</th><th>Cost</th><th>Detail</th></tr></thead><tbody>{visible.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</td><td><strong>{run.user_name || run.user_email || 'Unknown user'}</strong></td><td><strong>{run.model || '—'}</strong><small>{run.provider || ''}</small></td><td><span className={`insight-run-status status-${run.status?.startsWith('blocked') ? 'blocked' : run.status === 'allowed' ? 'allowed' : 'error'}`}>{run.status?.replaceAll('_', ' ') || 'Unknown'}</span></td><td>{run.total_tokens == null ? '—' : number(run.total_tokens)}</td><td>{run.estimated_cost_usd == null ? '—' : dollars(run.estimated_cost_usd)}</td><td><a href={`#activity-log?run_id=${encodeURIComponent(run.id)}`}>Open ↗</a></td></tr>)}</tbody></table></div> : <p className="insight-breakdown-empty">{runs.length ? 'No recent runs match this filter.' : 'No prompt runs in this period.'}</p>}</section>
}

export default function InsightsPage({ data }) {
  const summary = data?.summary || {}
  const days = activityDays(data?.series)
  const maxDay = Math.max(1, ...days.map((day) => day.allowed + day.blocked + day.other))
  const total = Number(summary.total_submissions || 0)
  const outcomes = [
    { label: 'Allowed', count: Number(summary.allowed || 0), color: 'allowed' },
    { label: 'Blocked', count: Number(summary.blocked || 0), color: 'blocked' },
    { label: 'Errors', count: Object.values(summary.errors || {}).reduce((sum, value) => sum + Number(value || 0), 0), color: 'other' },
  ]
  const models = data?.models || []
  const runTrend = days.map((day) => day.allowed + day.blocked + day.other)
  const costTrend = (data?.cost_series || []).map((row) => Number(row.cost_usd))
  return <div className="insights-page">
    <div className="insights-intro"><div><span className="insight-eyebrow">WORKSPACE INTELLIGENCE</span><h2>At a glance</h2><p>Policy activity and model usage from persisted runs over the last seven days.</p></div><span className="insight-period">Last 7 days · UTC</span></div>

    <section className="insight-metrics" aria-label="Key metrics">
      <Metric label="Prompt runs" value={number(total)} foot="Submitted in this period" tone="blue" href="activity-log" trend={runTrend} />
      <Metric label="Known tokens" value={number(Number(summary.known_prompt_tokens || 0) + Number(summary.known_completion_tokens || 0))} foot={`${number(summary.unknown_usage_runs)} runs with unknown usage`} tone="violet" href="catalog" />
      <Metric label="Estimated spend" value={dollars(summary.estimated_cost_usd)} foot={`${number(summary.unknown_cost_runs)} runs with unknown cost`} tone="amber" href="spend" trend={costTrend} />
      <Metric label="Violations" value={number(summary.violation_events)} foot={summary.violation_rate == null ? 'No completed evaluations' : `${(summary.violation_rate * 100).toFixed(1)}% of evaluated runs`} tone="rose" href="violations" />
    </section>

    <div className="insight-overview-grid">
      <BreakdownCard eyebrow="POLICY SIGNALS" title="Violations by category" rows={data?.violation_categories} href="#violations" />
      <BreakdownCard eyebrow="DETECTION" title="Violations by check type" rows={data?.violation_types} href="#violations" empty="No matched checks in this period." />
      <PeopleCard eyebrow="PEOPLE" title="Users at risk" rows={data?.users_at_risk} />
      <PeopleCard eyebrow="MODEL COST" title="Team spend by user" rows={data?.spend_by_user} mode="spend" />
    </div>

    <CostTrend rows={data?.cost_series} />

    <div className="insight-analysis-grid">
      <section className="insight-card insight-activity"><div className="insight-card-heading"><div><span className="insight-eyebrow">ACTIVITY</span><h3>Daily prompt volume</h3></div><div className="insight-legend"><span><i className="legend-allowed" />Allowed</span><span><i className="legend-blocked" />Blocked</span><span><i className="legend-other" />Other</span></div></div>
        {days.length ? <div className="insight-bar-chart" role="img" aria-label="Daily prompt volume by outcome">{days.map((day) => { const volume = day.allowed + day.blocked + day.other; return <div className="insight-day" key={day.date} title={`${dayLabel(day.date)}: ${volume} runs, ${day.allowed} allowed, ${day.blocked} blocked, ${day.other} other`}><span className="insight-day-total">{volume}</span><div className="insight-bar-track"><div className="insight-bar-stack" style={{ height: `${Math.max(4, volume / maxDay * 100)}%` }}><span className="bar-allowed" style={{ flex: day.allowed }} /><span className="bar-blocked" style={{ flex: day.blocked }} /><span className="bar-other" style={{ flex: day.other }} /></div></div><span className="insight-day-label">{dayLabel(day.date)}</span></div> })}</div> : <p className="insight-empty">No prompt runs in this period.</p>}
      </section>
      <section className="insight-card insight-outcomes"><div className="insight-card-heading"><div><span className="insight-eyebrow">POLICY EVALUATION</span><h3>Run outcomes</h3></div><a href="#violations">Explore violations ↗</a></div>
        <div className="insight-outcome-list">{outcomes.map((item) => <div className="insight-outcome" key={item.label}><div><span>{item.label}</span><strong>{number(item.count)}</strong></div><div className="insight-outcome-track"><span className={`fill-${item.color}`} style={{ width: `${total ? item.count / total * 100 : 0}%` }} /></div></div>)}</div>
        <p className="insight-footnote">Violation rate uses {number(summary.violation_rate_denominator)} completed evaluations. {number(summary.incomplete_evaluation)} runs had incomplete evaluation.</p>
      </section>
    </div>

    <section className="insight-card insight-models"><div className="insight-card-heading"><div><span className="insight-eyebrow">MODEL INSIGHTS</span><h3>Usage by model</h3></div><a href="#catalog">All models ↗</a></div>
      {models.length ? <div className="insight-table-wrap"><table className="insight-table"><thead><tr><th>Model</th><th>Runs</th><th>Known tokens</th><th>Estimated cost</th><th>Usage coverage</th></tr></thead><tbody>{models.map((model) => <tr key={`${model.provider}:${model.model}`}><td><strong>{model.model}</strong><small>{model.provider}</small></td><td>{number(model.runs)}</td><td>{number(model.known_tokens)}</td><td>{dollars(model.estimated_cost_usd)}</td><td>{Math.max(0, Number(model.runs || 0) - Number(model.unknown_usage_runs || 0))} / {number(model.runs)} runs</td></tr>)}</tbody></table></div> : <p className="insight-empty">Model usage will appear after a prompt run.</p>}
    </section>

    <RecentRuns runs={data?.recent_runs} />

    <section className="insight-configuration"><div><span className="insight-eyebrow">WORKSPACE SETUP</span><h3>Coverage and configuration</h3><p>Active configuration that protects your organization’s prompts.</p></div><div className="insight-config-counts"><span><strong>{number(data?.administration?.users)}</strong> people</span><span><strong>{number(data?.administration?.groups)}</strong> groups</span><span><strong>{number(data?.administration?.integrations)}</strong> integrations</span><span><strong>{number(data?.administration?.policies)}</strong> policies</span></div></section>
    {(summary.legacy_history_count || summary.unknown_cost_runs) ? <p className="insight-data-note">{number(summary.legacy_history_count)} legacy records are excluded from security rates. Cost totals include only runs with known estimates.</p> : null}
  </div>
}
