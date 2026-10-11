import { ArrowUp, MessageSquare, Plus, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { executePromptWorkspaceRun, fetchPromptWorkspaceContext, fetchPromptWorkspaceRun, fetchConversations, fetchConversation } from '../services/promptWorkspace/promptWorkspaceService'
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
  const errors = ['input_evaluation', 'output_evaluation'].flatMap((stage) => {
    const results = run[stage]?.rule_results || []
    const failed = results.filter((item) => item.outcome === 'error').map((item) => ({ ...item, stage }))
    const represented = new Set(failed.map((item) => item.reason_code))
    return [...failed, ...[...new Set(run[stage]?.errors || [])].filter((code) => !represented.has(code)).map((code) => ({ reason_code: code, stage }))]
  })
  if (!matches.length && !errors.length) return null
  return <section className="studio-findings" aria-label="Policy check details">
    <h3>Policy check details</h3>
    {matches.map((item, index) => <div className="studio-finding" key={item.rule_id + '-' + index}>
      <strong>{item.policy_name || item.type}</strong>
      <span>{item.stage === 'input_evaluation' ? 'Prompt' : 'Response'} · version {item.policy_version}</span>
      {item.evidence?.some((entry) => entry.entry_id) && <ul>{[...new Map(item.evidence.filter((entry) => entry.entry_id).map((entry) => [entry.entry_id, entry])).values()].map((entry) => <li key={entry.entry_id}>{entry.entry_name || entry.entry_id}</li>)}</ul>}
    </div>)}
    {errors.map((item, index) => <div className="studio-check-error" key={item.stage + '-' + index}>
      <strong>{item.policy_name || 'Security check'} · {item.stage === 'input_evaluation' ? 'Input' : 'Output'}</strong>
      <p>{validationMessages[item.reason_code] || 'A security check failed. Contact your administrator.'}</p>
      <code>{item.reason_code}</code>
    </div>)}
  </section>
}

function RunDetail({ run, currentUser }) {
  if (!run) return <div className="studio-empty"><span className="studio-empty-icon" aria-hidden="true"><MessageSquare size={25} /></span>
    <h2>What would you like to explore?</h2><p>Your prompt runs through your organization’s applicable policies before it reaches the model.</p></div>
  return <div className="studio-thread">
    <div className="studio-run-meta"><span className={'studio-status studio-status-' + runTone(run.status)}>{runLabel(run.status)}</span><span>{formatTime(run.created_at)}</span><span>{run.model}</span></div>
    {run.prompt != null && <div className="studio-message studio-message-user"><span className="studio-message-label">Your prompt</span><p>{run.prompt}</p></div>}
    {run.status === 'blocked_input' && <div className="studio-outcome studio-outcome-blocked" role="alert"><strong>Prompt blocked by policy</strong><p>Your prompt was not sent to the model. Review the matched checks and remove restricted content.</p></div>}
    {run.status === 'blocked_output' && <div className="studio-outcome studio-outcome-blocked" role="alert"><strong>Response withheld</strong><p>The model response failed a policy check, so its text is not shown.</p></div>}
    {run.status === 'validation_error' && <div className="studio-outcome studio-outcome-error" role="alert"><strong>Security check could not complete</strong><p>This is a checking error, not proof of a policy violation. Unchecked content was withheld.</p></div>}
    {run.error_code === 'policy_required' && <div className="studio-outcome studio-outcome-error" role="alert"><strong>Message not sent</strong><p>No input policy was available under the configuration used for this message. Check your current workspace settings before retrying.</p>{isAdmin(currentUser) ? <a href="#users">Review my policy groups ↗</a> : <p>Ask your administrator to assign your policy groups.</p>}</div>}
    {run.error_message && run.error_code !== 'policy_required' && <div className="studio-outcome studio-outcome-error" role="alert">{run.error_message}</div>}
    {run.response_text != null && !run.response_withheld && <div className="studio-message studio-message-response"><span className="studio-message-label">Model response</span><p>{run.response_text}</p></div>}
    {run.content_expired && <p className="studio-muted">Stored text has expired; the decision record remains.</p>}
    {run.status === 'processing' && <div className="studio-thinking" role="status"><span className="studio-thinking-dot" />Checking policies and preparing your reply…</div>}
    {run.status !== 'processing' && <details className="studio-message-details" open={run.status === 'validation_error'}><summary>Security checks & usage <span className={'studio-status studio-status-' + runTone(run.status)}>{runLabel(run.status)}</span></summary><Findings run={run} />
    <dl className="studio-run-stats">
      <div><dt>Input tokens</dt><dd>{run.prompt_tokens ?? 'Unknown'}</dd></div>
      <div><dt>Output tokens</dt><dd>{run.completion_tokens ?? 'Unknown'}</dd></div>
      <div><dt>Estimated cost</dt><dd>{run.estimated_cost_usd == null ? 'Unknown' : '$' + run.estimated_cost_usd}</dd></div>
      <div><dt>Total time</dt><dd>{run.total_latency_ms == null ? 'Unknown' : run.total_latency_ms + ' ms'}</dd></div>
    </dl></details>}
  </div>
}

export default function PromptStudioPage({ runId = '', conversationId = '', currentUser }) {
  const [context, setContext] = useState({ integrations: [], groups: [] })
  const [history, setHistory] = useState({ items: [], total: 0, page_size: 20 })
  const [page, setPage] = useState(1)
  const [chat, setChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagePage, setMessagePage] = useState(1)
  const [messageTotal, setMessageTotal] = useState(0)
  const [form, setForm] = useState({ integration_id: '', model: '', prompt: '', temperature: 0.2, max_tokens: 1024 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyUnavailable, setHistoryUnavailable] = useState(false)
  const [historyReady, setHistoryReady] = useState(false)
  const [historyReload, setHistoryReload] = useState(0)
  const [pending, setPending] = useState(null)
  const [retry, setRetry] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contextNote, setContextNote] = useState('Follow-ups use recent allowed messages. Blocked, failed and expired messages are excluded.')
  const promptRef = useRef(null)
  const bodyRef = useRef(null)
  const generation = useRef(0)
  const alive = useRef(true)
  const submitting = useRef(false)
  const scrollToEnd = useRef(false)
  const contextRef = useRef(context)

  useEffect(() => {
    alive.current = true
    let active = true
    fetchPromptWorkspaceContext().then((result) => {
      if (!active) return
      contextRef.current = result
      setContext(result)
      setForm((current) => {
        if (current.integration_id || !result.integrations?.length) return current
        const first = result.integrations[0]
        return { ...current, integration_id: first.id, model: first.models?.[0] || '' }
      })
    }).catch((problem) => { if (active) setError(problem.message) })
    return () => { active = false; alive.current = false; generation.current += 1 }
  }, [])

  useEffect(() => {
    let active = true
    fetchConversations(page).then((value) => {
      if (active) { setHistory(value); setHistoryLoading(false); setHistoryError(''); setHistoryReady(true); setHistoryUnavailable(false) }
    }).catch((problem) => {
      if (active) { setHistoryError(problem.message); setHistoryUnavailable(problem.code === 'conversation_api_unavailable'); setHistoryLoading(false) }
    })
    return () => { active = false }
  }, [page, historyReload])

  useEffect(() => {
    let active = true
    if (conversationId) {
      void show(conversationId)
    } else if (runId) {
      fetchPromptWorkspaceRun(runId).then((value) => {
        if (active) void show(value.run.conversation_id || value.run.id)
      }).catch((problem) => { if (active) setError(problem.message) })
    }
    return () => { active = false }
    // Route changes open persisted chats; show uses a generation fence for stale fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, runId])

  useEffect(() => {
    if (scrollToEnd.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      scrollToEnd.current = false
    }
  }, [messages, pending, loadingChat])

  useEffect(() => {
    if (!historyOpen) return
    const returnFocus = document.activeElement
    document.querySelector('.studio-history-close')?.focus()
    function closeOnEscape(event) { if (event.key === 'Escape') setHistoryOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('keydown', closeOnEscape); returnFocus?.focus?.() }
  }, [historyOpen])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 701px)')
    function closeDrawer(event) { if (event.matches) setHistoryOpen(false) }
    desktop.addEventListener('change', closeDrawer)
    return () => desktop.removeEventListener('change', closeDrawer)
  }, [])

  const selected = context.integrations.find((item) => item.id === form.integration_id)
  const policySetupRequired = Boolean(context.require_active_policy && context.input_policy_coverage?.[form.integration_id] === false)
  const policyOptionalWithoutInput = context.require_active_policy === false && context.input_policy_coverage?.[form.integration_id] === false
  const optionalAdminPolicy = policyOptionalWithoutInput && isAdmin(currentUser)
  function replaceRoute(id) {
    window.history.replaceState(null, '', id ? `#prompt-studio?chat=${encodeURIComponent(id)}` : '#prompt-studio')
  }
  async function refreshHistory(historyPage = page) {
    try {
      const value = await fetchConversations(historyPage)
      if (alive.current) { setHistory(value); setHistoryError(''); setHistoryReady(true); setHistoryUnavailable(false) }
    } catch (problem) {
      if (alive.current) { setHistoryError(problem.message); setHistoryUnavailable(problem.code === 'conversation_api_unavailable') }
    }
  }
  function applyRun(run) {
    scrollToEnd.current = true
    setMessages((current) => current.some((item) => item.id === run.id)
      ? current.map((item) => item.id === run.id ? run : item) : [...current, run])
  }
  async function poll(id, fence) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (!alive.current || fence !== generation.current) return
      const response = await fetchPromptWorkspaceRun(id)
      if (!alive.current || fence !== generation.current) return
      if (response.run.status !== 'processing') { applyRun(response.run); await refreshHistory(); return }
    }
    if (alive.current) setError('This reply is still processing. Reopen this chat to check its status before sending again.')
  }
  async function show(id) {
    if (submitting.current) return
    const fence = ++generation.current
    setLoadingChat(true); setError(''); setPending(null); setRetry(null); setHistoryOpen(false)
    setChat(null); setMessages([]); setForm((current) => ({ ...current, prompt: '' }))
    try {
      const response = await fetchConversation(id)
      if (!alive.current || fence !== generation.current) return
      scrollToEnd.current = true
      setChat(response.conversation); setMessages(response.items); setMessagePage(1)
      setMessageTotal(response.total); setContextNote(response.context_note)
      const latest = response.items.at(-1)
      if (latest) setForm((current) => {
        const integration = contextRef.current.integrations.find((item) => item.id === latest.integration_id)
        return integration?.models?.includes(latest.model)
          ? { ...current, integration_id: latest.integration_id, model: latest.model } : current
      })
      replaceRoute(id)
      setLoadingChat(false)
      if (latest?.status === 'processing') {
        submitting.current = true; setBusy(true)
        try { await poll(latest.id, fence) } finally { submitting.current = false; if (alive.current) setBusy(false) }
      }
    } catch (problem) {
      if (alive.current && fence === generation.current) {
        setError(problem.code === 'not_found' ? 'This conversation could not be found in your account. Choose another chat or start a new one.' : problem.message)
        if (problem.code === 'conversation_api_unavailable') { setHistoryError(problem.message); setHistoryUnavailable(true) }
      }
    }
    finally { if (alive.current && fence === generation.current) setLoadingChat(false) }
  }
  async function loadOlder() {
    if (!chat || loadingOlder) return
    const fence = generation.current
    const previousHeight = bodyRef.current?.scrollHeight || 0
    setLoadingOlder(true)
    try {
      const response = await fetchConversation(chat.id, messagePage + 1)
      if (!alive.current || fence !== generation.current) return
      setMessages((current) => [...response.items, ...current]); setMessagePage(response.page)
      setMessageTotal(response.total)
      requestAnimationFrame(() => {
        if (bodyRef.current && fence === generation.current) bodyRef.current.scrollTop += bodyRef.current.scrollHeight - previousHeight
      })
    } catch (problem) { if (alive.current && fence === generation.current) setError(problem.message) }
    finally { if (alive.current) setLoadingOlder(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (submitting.current || !form.prompt.trim() || loadingChat || !historyReady || historyUnavailable || policySetupRequired) return
    submitting.current = true; setBusy(true); setError('')
    const fence = generation.current
    const payload = { ...form, ...(chat ? { conversation_id: chat.id } : {}) }
    const fingerprint = JSON.stringify(payload)
    const key = retry?.fingerprint === fingerprint ? retry.key : crypto.randomUUID()
    setRetry({ key, fingerprint })
    scrollToEnd.current = true
    setPending({ id: 'pending', prompt: form.prompt, model: form.model, status: 'processing', created_at: new Date().toISOString() })
    async function accept(run) {
      if (!alive.current || fence !== generation.current) return
      setPending(null); applyRun(run)
      if (!run.conversation_id) {
        setHistoryUnavailable(true)
        setHistoryError('The server recorded this reply without conversation support. Ask your administrator to update the backend, then retry loading chats.')
        setForm((current) => ({ ...current, prompt: '' })); setRetry(null)
        return
      }
      const id = run.conversation_id
      const title = chat?.title || form.prompt.trim().replace(/\s+/g, ' ').slice(0, 80)
      const duplicate = messages.some((item) => item.id === run.id)
      // Keep confirmed messages discoverable even if the next history GET fails.
      setHistory((current) => {
        const existing = current.items.find((item) => item.id === id)
        const item = { ...(existing || {}), id, title, model: run.model,
          created_at: existing?.created_at || run.created_at, updated_at: run.created_at,
          message_count: (existing?.message_count ?? messageTotal) + (duplicate ? 0 : 1) }
        return { ...current, total: current.total + (!chat && !existing ? 1 : 0),
          items: [item, ...current.items.filter((entry) => entry.id !== id)].slice(0, current.page_size) }
      })
      if (!chat) setChat({ id, title: form.prompt.trim().replace(/\s+/g, ' ').slice(0, 80) })
      replaceRoute(id)
      setForm((current) => ({ ...current, prompt: '' })); setRetry(null)
      if (!duplicate) setMessageTotal((current) => current + 1)
      try {
        if (!chat) setPage(1)
        await refreshHistory(chat ? page : 1)
        if (run.status === 'processing') await poll(run.id, fence)
      } catch (problem) {
        if (alive.current && fence === generation.current) setError(`The server accepted your message, but its status could not be refreshed. ${problem.message}`)
      }
    }
    try {
      const response = await executePromptWorkspaceRun(payload, key)
      await accept(response.run)
    } catch (problem) {
      if (!alive.current || fence !== generation.current) return
      if (problem.run) {
        try { await accept(problem.run) } catch (refreshError) { setError(refreshError.message) }
      } else {
        setPending(null)
        setError(`${problem.message} Your message is still in the composer; retrying it uses the same request key.`)
      }
    } finally {
      submitting.current = false
      if (alive.current && fence === generation.current) { setBusy(false); promptRef.current?.focus() }
    }
  }
  function newChat() {
    if (submitting.current) return
    generation.current += 1
    setChat(null); setMessages([]); setMessageTotal(0); setPending(null); setRetry(null)
    setForm((current) => ({ ...current, prompt: '' })); setError(''); setHistoryOpen(false); setLoadingChat(false)
    replaceRoute(null); promptRef.current?.focus()
  }
  function onComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(min-width: 701px)').matches) {
      event.preventDefault()
      if (!busy && form.prompt.trim() && form.integration_id && form.model) event.currentTarget.form.requestSubmit()
    }
  }
  const turns = pending ? [...messages, pending] : messages
  function retryHistory() { setHistoryLoading(true); setHistoryReload((current) => current + 1) }
  return <div className="studio-page">
    <div className={'studio-policy-banner ' + (context.enforcement_ready === false || policySetupRequired ? 'is-warning' : '')} role="status">
      <span className="studio-policy-icon" aria-hidden="true"><ShieldCheck size={17} /></span>
      <div><strong>{policySetupRequired ? 'Policy setup required' : context.enforcement_ready === false ? 'Policy checking needs attention' : optionalAdminPolicy ? 'Policies optional for admins' : policyOptionalWithoutInput ? 'No input policy assigned' : 'Organization policy checks'}</strong>
        <p>{policySetupRequired ? 'Your account needs a group with an active input policy for this integration. Set up your policy groups before sending.' : context.enforcement_ready === false ? context.readiness_reason : optionalAdminPolicy ? 'You can send messages without a policy assignment. Policies assigned to your groups still apply.' : policyOptionalWithoutInput ? 'Your organization allows messages without an input policy. Assigned output policies still apply.' : 'Every message and its conversation context pass through applicable policies. Restricted replies are withheld.'}</p>
        <small>Groups: {context.groups.length ? context.groups.map((group) => group.name).join(', ') : 'none assigned'}</small></div>
      {isAdmin(currentUser) ? <a href={policySetupRequired || optionalAdminPolicy ? '#users' : '#inventory'}>{policySetupRequired ? 'Manage my groups' : optionalAdminPolicy ? 'My policy groups' : 'Manage groups'} <span aria-hidden="true">↗</span></a> : policySetupRequired && <p>Ask your administrator to assign your policy groups.</p>}
    </div>
    <div className="studio-layout">
      <aside className={'studio-history ' + (historyOpen ? 'is-open' : '')} aria-label="Chat history">
        <div className="studio-history-head"><div><span className="studio-kicker">YOUR WORKSPACE</span><h2>Chats</h2></div>
          <button type="button" className="studio-new-button" onClick={newChat} disabled={busy} aria-label="New chat" title="New chat"><Plus size={16} /></button><button type="button" className="studio-history-close" onClick={() => setHistoryOpen(false)} aria-label="Close chats"><X size={16} /></button></div>
        <button type="button" className="studio-new-chat" disabled={busy} onClick={newChat}><Plus size={14} aria-hidden="true" /> New chat</button>
        <div className="studio-history-list">
          {historyLoading ? <p className="studio-history-empty" role="status">Loading your chats…</p> : null}
          {historyError && <div className="studio-history-error" role="alert"><strong>{historyUnavailable ? 'Chat history unavailable' : 'Could not load chats'}</strong><p>{historyError}</p><button type="button" onClick={retryHistory} disabled={historyLoading}>{historyLoading ? 'Retrying…' : 'Retry loading chats'}</button></div>}
          {!historyLoading && history.items.length ? history.items.map((item) =>
            <button type="button" key={item.id} disabled={busy} onClick={() => show(item.id)} aria-current={chat?.id === item.id ? 'true' : undefined} className={'studio-history-item ' + (chat?.id === item.id ? 'is-active' : '')}>
              <span className="studio-history-title">{item.title}</span>
              <span className="studio-history-meta"><span className="studio-history-date">{formatTime(item.updated_at)}</span><span>{item.message_count} {item.message_count === 1 ? 'message' : 'messages'}</span></span>
            </button>) : !historyLoading && !historyError ? <div className="studio-history-empty"><strong>A home for your conversations</strong><p>Send a message to save your first chat. Follow-ups stay in the same thread.</p></div> : null}
        </div>
        {history.total > history.page_size && <div className="studio-history-pager"><button type="button" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {Math.ceil(history.total / history.page_size)}</span><button type="button" disabled={page * history.page_size >= history.total || busy} onClick={() => setPage(page + 1)}>Next</button></div>}
        <p className="studio-history-footnote">{historyUnavailable ? 'Chat support requires a server update.' : 'Saved to your workspace account.'}</p>
      </aside>
      <section className="studio-workspace" aria-label="Conversation" inert={historyOpen ? true : undefined}>
        <header className="studio-workspace-head"><div><span className="studio-kicker">PROMPT STUDIO</span><h2>{chat?.title || (loadingChat ? 'Opening chat…' : 'New chat')}</h2></div>
          <div className="studio-header-actions"><button type="button" className="studio-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>Chats</button><button type="button" className="studio-header-new" onClick={newChat} disabled={busy}><Plus size={13} />New chat</button></div></header>
        <div className="studio-workspace-body" ref={bodyRef} aria-busy={loadingChat}>
          {loadingChat ? <div className="studio-thread-loading" role="status"><span /><span /><span /><p>Opening your conversation…</p></div> : turns.length ? <div className="studio-conversation-thread">
            {messages.length < messageTotal && <button type="button" className="studio-load-older" disabled={loadingOlder || busy} onClick={loadOlder}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button>}
            {turns.map((run) => <article className="studio-turn" key={run.id} aria-label={`Message sent ${formatTime(run.created_at)}`}><RunDetail run={run} currentUser={currentUser} /></article>)}
          </div> : <RunDetail run={null} />}
        </div>
        <form className="studio-composer" onSubmit={submit}>
          {error && <p className="studio-form-error" role="alert">{error}</p>}
          {(!historyReady || historyUnavailable) && !historyLoading && <div className="studio-history-notice" role="status"><span>Sending is paused until chat history is available.</span><button type="button" onClick={retryHistory}>Retry</button></div>}
          <label className="studio-prompt-label" htmlFor="studio-prompt">{chat ? 'Continue the conversation' : 'Start a conversation'}</label>
          <textarea id="studio-prompt" ref={promptRef} required disabled={busy || loadingChat} maxLength="24000" rows="3" placeholder={chat ? 'Ask a follow-up…' : 'Message Averiq…'} value={form.prompt} onKeyDown={onComposerKeyDown} onChange={(event) => setForm({ ...form, prompt: event.target.value })} />
          <div className="studio-composer-controls">
            <label>Integration<select required disabled={busy || loadingChat} value={form.integration_id} onChange={(event) => {
              const integration = context.integrations.find((item) => item.id === event.target.value)
              setForm({ ...form, integration_id: event.target.value, model: integration?.models?.[0] || '' })
            }}><option value="">Select integration</option>{context.integrations.map((item) => <option key={item.id} value={item.id}>{item.account_name} · {item.provider}</option>)}</select></label>
            <label>Model<select required disabled={busy || loadingChat} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}><option value="">Select model</option>{selected?.models.map((model) => <option key={model}>{model}</option>)}</select></label>
            <details className="studio-options"><summary>Options</summary><div><label>Temperature<input disabled={busy} type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} /></label><label>Max tokens<input disabled={busy} type="number" min="1" max="8192" value={form.max_tokens} onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) })} /></label></div></details>
            <button type="submit" className="studio-send" disabled={busy || loadingChat || !historyReady || historyUnavailable || policySetupRequired || !form.integration_id || !form.model || !form.prompt.trim()} aria-label={busy ? 'Waiting for reply' : 'Send message'}>{busy ? 'Thinking…' : 'Send'} <ArrowUp size={14} aria-hidden="true" /></button>
          </div>
          <div className="studio-composer-note"><span title={contextNote}>Recent allowed messages provide context.</span><span className="studio-keyboard-hint">Enter to send · Shift + Enter for a new line</span></div>
        </form>
      </section>
    </div>
  </div>
}
