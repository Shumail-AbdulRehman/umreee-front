import { useEffect, useRef, useState } from 'react'
import { executePromptWorkspaceRun, fetchPromptWorkspaceContext, fetchPromptWorkspaceRun, fetchPromptWorkspaceRuns } from '../services/promptWorkspace/promptWorkspaceService'
import { isAdmin } from '../utils/permissions'
import './workspace.css'

const validationMessages = {
  remote_detection_disabled: 'Security checking is disabled. Ask your administrator to enable it.',
  detector_key_missing: 'The DLP service key is missing. Contact your administrator.',
  detector_timeout: 'The security service took too long to respond. Your prompt was not approved.',
  stage_timeout: 'Security checking exceeded its time limit. Your prompt was not approved.',
  detector_http_error: 'The security service rejected the check. Contact your administrator.',
  detector_invalid_response: 'The security service returned an unexpected result. Content has been withheld.',
  detector_incomplete_response: 'Not all selected security checks completed. Content has been withheld.',
  detector_unavailable: 'The security service could not be reached. Try again later.',
  invalid_detector_selection: 'The assigned policy selection is invalid. Contact your administrator.',
}

const runLabel = (status = '') => status.replaceAll('_', ' ')
const runTone = (status = '') => status.startsWith('blocked') ? 'blocked' : status === 'allowed' || status === 'legacy_completed' ? 'allowed' : status === 'processing' ? 'processing' : 'error'
const formatTime = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

function Findings({ run }) {
  const matches = ['input_evaluation', 'output_evaluation'].flatMap((stage) =>
    (run[stage]?.rule_results || []).filter((item) => item.outcome === 'match').map((item) => ({ ...item, stage })))
  const errors = [...new Set(['input_evaluation', 'output_evaluation'].flatMap((stage) => run[stage]?.errors || []))]
  if (!matches.length && !errors.length) return null
  return <section className="studio-findings" aria-label="Policy check details">
    <h3>Policy check details</h3>
    {matches.map((item, index) => <div className="studio-finding" key={item.rule_id + '-' + index}>
      <strong>{item.policy_name || item.type}</strong>
      <span>{item.stage === 'input_evaluation' ? 'Prompt' : 'Response'} · version {item.policy_version}</span>
      {item.evidence?.some((entry) => entry.entry_id) && <ul>{[...new Map(item.evidence.filter((entry) => entry.entry_id).map((entry) => [entry.entry_id, entry])).values()].map((entry) => <li key={entry.entry_id}>{entry.entry_name || entry.entry_id}</li>)}</ul>}
    </div>)}
    {errors.map((code) => <p className="studio-check-error" key={code}>{validationMessages[code] || 'A security check failed. Contact your administrator.'}</p>)}
  </section>
}

function RunDetail({ run }) {
  if (!run) return <div className="studio-empty"><span className="studio-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v12H8l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></svg></span>
    <h2>What would you like to explore?</h2><p>Your prompt runs through your organization’s applicable policies before it reaches the model.</p></div>
  return <div className="studio-thread">
    <div className="studio-run-meta"><span className={'studio-status studio-status-' + runTone(run.status)}>{runLabel(run.status)}</span><span>{formatTime(run.created_at)}</span><span>{run.model}</span></div>
    {run.prompt != null && <div className="studio-message studio-message-user"><span className="studio-message-label">Your prompt</span><p>{run.prompt}</p></div>}
    {run.status === 'blocked_input' && <div className="studio-outcome studio-outcome-blocked" role="alert"><strong>Prompt blocked by policy</strong><p>Your prompt was not sent to the model. Review the matched checks and remove restricted content.</p></div>}
    {run.status === 'blocked_output' && <div className="studio-outcome studio-outcome-blocked" role="alert"><strong>Response withheld</strong><p>The model response failed a policy check, so its text is not shown.</p></div>}
    {run.status === 'validation_error' && <div className="studio-outcome studio-outcome-error" role="alert"><strong>Security check could not complete</strong><p>This is a checking error, not proof of a policy violation. Unchecked content was withheld.</p></div>}
    {run.error_message && <div className="studio-outcome studio-outcome-error" role="alert">{run.error_message}</div>}
    {run.response_text != null && !run.response_withheld && <div className="studio-message studio-message-response"><span className="studio-message-label">Model response</span><p>{run.response_text}</p></div>}
    {run.content_expired && <p className="studio-muted">Stored text has expired; the decision record remains.</p>}
    <Findings run={run} />
    <dl className="studio-run-stats">
      <div><dt>Input tokens</dt><dd>{run.prompt_tokens ?? 'Unknown'}</dd></div>
      <div><dt>Output tokens</dt><dd>{run.completion_tokens ?? 'Unknown'}</dd></div>
      <div><dt>Estimated cost</dt><dd>{run.estimated_cost_usd == null ? 'Unknown' : '$' + run.estimated_cost_usd}</dd></div>
      <div><dt>Total time</dt><dd>{run.total_latency_ms == null ? 'Unknown' : run.total_latency_ms + ' ms'}</dd></div>
    </dl>
  </div>
}

export default function PromptStudioPage({ runId = '', currentUser }) {
  const [context, setContext] = useState({ integrations: [], groups: [] })
  const [history, setHistory] = useState({ items: [], total: 0, page_size: 20 })
  const [page, setPage] = useState(1)
  const [form, setForm] = useState({ integration_id: '', model: '', prompt: '', temperature: 0.2, max_tokens: 1024 })
  const [latest, setLatest] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const promptRef = useRef(null)

  useEffect(() => {
    fetchPromptWorkspaceContext().then((result) => {
      setContext(result)
      setForm((current) => {
        if (current.integration_id || !result.integrations?.length) return current
        const first = result.integrations[0]
        return { ...current, integration_id: first.id, model: first.models?.[0] || '' }
      })
    }).catch((problem) => setError(problem.message))
  }, [])
  useEffect(() => { fetchPromptWorkspaceRuns(page).then(setHistory).catch((problem) => setError(problem.message)) }, [page])
  useEffect(() => { if (runId) fetchPromptWorkspaceRun(runId).then((result) => setLatest(result.run)).catch((problem) => setError(problem.message)) }, [runId])

  const selected = context.integrations.find((item) => item.id === form.integration_id)
  async function refresh() { setHistory(await fetchPromptWorkspaceRuns(page)) }
  async function show(id) {
    try { setLatest((await fetchPromptWorkspaceRun(id)).run); setHistoryOpen(false); setError('') }
    catch (problem) { setError(problem.message) }
  }
  async function poll(id) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const response = await fetchPromptWorkspaceRun(id)
      if (response.run.status !== 'processing') { setLatest(response.run); await refresh(); return }
    }
    setError('Run is still processing. Open it from history to check again.')
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const fingerprint = JSON.stringify(form)
    const key = retry?.fingerprint === fingerprint ? retry.key : crypto.randomUUID()
    setRetry({ key, fingerprint })
    try {
      const response = await executePromptWorkspaceRun(form, key)
      setLatest(response.run)
      if (response.run.status === 'processing') await poll(response.run.id)
      else { setRetry(null); await refresh() }
    } catch (problem) {
      setError(problem.message)
      if (problem.run) { setLatest(problem.run); setRetry(null); await refresh() }
    } finally { setBusy(false) }
  }
  function newPrompt() {
    setLatest(null)
    setForm((current) => ({ ...current, prompt: '' }))
    setError('')
    setHistoryOpen(false)
    promptRef.current?.focus()
  }

  return <div className="studio-page">
    <div className={'studio-policy-banner ' + (context.enforcement_ready === false ? 'is-warning' : '')} role="status">
      <span className="studio-policy-icon" aria-hidden="true">◈</span>
      <div><strong>{context.enforcement_ready === false ? 'Policy checking needs attention' : 'Protected prompt workflow'}</strong>
        <p>{context.enforcement_ready === false ? context.readiness_reason : 'Prompts are evaluated against applicable active policies before the model call.'}</p>
        <small>Effective groups: {context.groups.length ? context.groups.map((group) => group.name).join(', ') : 'none'}</small></div>
      {isAdmin(currentUser) && <a href="#inventory">Manage groups <span aria-hidden="true">↗</span></a>}
    </div>

    <div className="studio-layout">
      <aside className={'studio-history ' + (historyOpen ? 'is-open' : '')} aria-label="Run history">
        <div className="studio-history-head"><div><span className="studio-kicker">YOUR ACTIVITY</span><h2>History</h2></div>
          <button type="button" className="studio-new-button" onClick={newPrompt} aria-label="New prompt" title="New prompt">＋</button></div>
        <div className="studio-history-list">{history.items.length ? history.items.map((run) =>
          <button type="button" key={run.id} onClick={() => show(run.id)} className={'studio-history-item ' + (latest?.id === run.id ? 'is-active' : '')}>
            <span className="studio-history-title">{run.model || 'Prompt run'}</span>
            <span className="studio-history-meta"><span className="studio-history-date">{formatTime(run.created_at)}</span>
              <span className={'studio-status studio-status-' + runTone(run.status)}>{runLabel(run.status)}</span></span>
          </button>) : <p className="studio-history-empty">Your runs will appear here.</p>}</div>
        {history.total > history.page_size && <div className="studio-history-pager"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {Math.ceil(history.total / history.page_size)}</span><button type="button" disabled={page * history.page_size >= history.total} onClick={() => setPage(page + 1)}>Next</button></div>}
      </aside>

      <section className="studio-workspace" aria-label="Prompt workspace">
        <header className="studio-workspace-head"><div><span className="studio-kicker">PROMPT STUDIO</span><h2>{latest ? 'Run detail' : 'New conversation'}</h2></div>
          <button type="button" className="studio-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>History</button></header>
        <div className="studio-workspace-body"><RunDetail run={latest} /></div>
        <form className="studio-composer" onSubmit={submit}>
          {error && <p className="studio-form-error" role="alert">{error}</p>}
          <label className="studio-prompt-label" htmlFor="studio-prompt">Your prompt</label>
          <textarea id="studio-prompt" ref={promptRef} required maxLength="24000" rows="3" placeholder="Ask anything…" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} />
          <div className="studio-composer-controls">
            <label>Integration<select required value={form.integration_id} onChange={(event) => {
              const integration = context.integrations.find((item) => item.id === event.target.value)
              setForm({ ...form, integration_id: event.target.value, model: integration?.models?.[0] || '' })
            }}><option value="">Select integration</option>{context.integrations.map((item) => <option key={item.id} value={item.id}>{item.account_name} · {item.provider}</option>)}</select></label>
            <label>Model<select required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}><option value="">Select model</option>{selected?.models.map((model) => <option key={model}>{model}</option>)}</select></label>
            <details className="studio-options"><summary>Options</summary><div><label>Temperature<input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} /></label>
              <label>Max tokens<input type="number" min="1" max="8192" value={form.max_tokens} onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) })} /></label></div></details>
            <button type="submit" className="studio-send" disabled={busy || !form.integration_id || !form.model || !form.prompt.trim()}>{busy ? 'Running…' : 'Run prompt'} <span aria-hidden="true">↗</span></button>
          </div>
        </form>
      </section>
    </div>
  </div>
}
