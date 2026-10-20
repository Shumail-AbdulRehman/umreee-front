import { useEffect, useRef, useState } from 'react'
import { ShieldAlert, ArrowUpRight } from 'lucide-react'
import { getViolation, listViolations, resolveViolation } from '../services/observability'
import { isAdmin } from '../utils/permissions'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination, SectionHeader } from '../components/Surface'
import { formatDate } from '../lib/format'
import Modal from '../components/Modal'
import LoadingSurface from '../components/LoadingSurface'
export default function ViolationsPage({ currentUser }) {
  const detailVersion = useRef(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState({ items: [], total: 0, page_size: 20 })
  const [selected, setSelected] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() { setResult(await listViolations(`?${new URLSearchParams({ page: String(page), status })}`)) }
  useEffect(() => { void Promise.resolve().then(refresh).catch((problem) => setError(problem.message)) }, [page, status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { detailVersion.current += 1 }, [])
  function closeDetail() { detailVersion.current += 1; setDetailId(null); setSelected(null); setDetailError('') }
  async function open(id) {
    const version = ++detailVersion.current
    setDetailId(id); setSelected(null); setNote(''); setDetailError('')
    try {
      const item = (await getViolation(id)).violation
      if (version !== detailVersion.current) return
      setSelected(item); setNote(item.resolution_note || '')
    } catch (problem) { if (version === detailVersion.current) setDetailError(problem.message) }
  }
  async function save(next) {
    const version = detailVersion.current
    setBusy(true)
    try { const value = await resolveViolation(selected.id, { resolution_status: next, note, version: selected.version }); if (version === detailVersion.current) { setSelected(value.violation); setDetailError('') }; await refresh(); setError('') }
    catch (problem) { if (version === detailVersion.current) setDetailError(problem.message) }
    finally { setBusy(false) }
  }
  return <div className="admin-stack"><div className="management-intro"><div><ShieldAlert size={23} /><span><strong>Policy incident review</strong><p>Recorded policy matches. A validator error alone is not a violation.</p></span></div><StatusBadge status="open">{result.total} matching incidents</StatusBadge></div><div className="admin-toolbar"><label>Resolution status<select aria-label="Filter resolution" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All resolutions</option><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></label></div>{error && <div className="admin-error" role="alert">{error}</div>}<DataTable title="Recorded violations" description="Review policy evidence and track incident resolution." rows={result.items} emptyTitle="No matching incidents" emptyDescription="Policy matches appear here when recorded. Select another resolution filter to see other incidents." columns={[
    { id: 'when', label: 'Recorded', value: (item) => item.created_at, render: (item) => formatDate(item.created_at) },
    { id: 'policy', label: 'Policy', value: (item) => item.policy_name, render: (item) => <strong>{item.policy_name}</strong> },
    { id: 'severity', label: 'Severity', value: (item) => item.severity, render: (item) => <StatusBadge status={item.severity} /> },
    { id: 'action', label: 'Action', value: (item) => item.action },
    { id: 'stage', label: 'Stage', value: (item) => item.stage, className: 'capitalize' },
    { id: 'resolution', label: 'Resolution', value: (item) => item.resolution_status, render: (item) => <StatusBadge status={item.resolution_status} /> },
    { id: 'detail', label: 'Detail', required: true, render: (item) => <button className="btn" type="button" aria-label={`Open violation for ${item.policy_name}`} onClick={() => open(item.id)}>Open <ArrowUpRight size={13} /></button> },
  ]} /><Pagination page={page} pageSize={result.page_size} total={result.total} onPageChange={setPage} noun="violations" />{detailId && <Modal title="Violation detail" onClose={closeDetail}><div className="admin-stack">{!selected && !detailError && <LoadingSurface kind="violation-detail" label="Loading incident details…" />}{detailError && <div className="admin-error" role="alert"><p>{detailError}</p>{!selected && <button type="button" className="btn" onClick={() => open(detailId)}>Retry detail</button>}</div>}{selected && <><SectionHeader title={selected.policy_name} description={`${selected.category} · ${selected.stage} · policy version ${selected.policy_version}`} /><div className="detail-badges"><StatusBadge status={selected.severity} /><StatusBadge status={selected.resolution_status} /><span>{selected.action}</span></div><div className="evidence-note"><strong>Safe evidence</strong><p>{selected.findings?.map((item) => `${item.type}${item.field ? ` in ${item.field}` : ''}`).join(', ') || 'None'}. Matched text is never shown here.</p></div><p><a href={`#prompt-studio?run_id=${encodeURIComponent(selected.run_id)}`}>Open this run’s safe detail ↗</a></p>{isAdmin(currentUser) && <><label>Review note<textarea maxLength="2000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for your team's review…" /></label><div className="admin-actions"><button className="btn" disabled={busy} onClick={() => save('reviewed')}>Mark reviewed</button><button className="btn primary" disabled={busy} onClick={() => save('resolved')}>{busy ? 'Saving…' : 'Resolve'}</button></div></>}</>}</div></Modal>}</div>
}
