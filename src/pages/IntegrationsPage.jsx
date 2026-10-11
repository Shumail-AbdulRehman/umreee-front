import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination } from '../components/Surface'
import { useEffect, useRef, useState } from 'react'
import { createLLMIntegration, fetchAvailableLLMModels, fetchLLMIntegrationPage, fetchStoredModels, setIntegrationStatus, updateLLMIntegration } from '../services/integrations/llmIntegrationService'
import Modal from '../components/Modal'
import FieldErrors from '../components/FieldErrors'

const providers = ['openai', 'groq', 'ollama', 'gemini', 'deepseek', 'anthropic']
const blank = { provider: 'openai', account_name: '', api_key: '', models: [], model_prices: [], system_prompt: '', base_url: '' }

export default function IntegrationsPage({ openCreateIntegration = false }) {
  const discoveryVersion = useRef(0)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState(openCreateIntegration ? {} : null)
  const [form, setForm] = useState(blank)
  const [models, setModels] = useState([])
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [discovering, setDiscovering] = useState(false)

  async function refresh() {
    try { const result = await fetchLLMIntegrationPage(page); setItems(result.items); setTotal(result.total); setError('') }
    catch (problem) { setError(problem.message) }
  }
  useEffect(() => { void Promise.resolve().then(refresh) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(item = null) {
    discoveryVersion.current += 1
    setEditing(item || {})
    setForm(item ? { provider: item.provider, account_name: item.account_name, api_key: '',
      models: item.models, model_prices: item.model_prices || [], system_prompt: item.system_prompt || '', base_url: item.base_url || '', version: item.version } : structuredClone(blank))
    setModels(item?.models || [])
    setError('')
    setFieldErrors({})
  }
  function closeEditor() {
    discoveryVersion.current += 1
    setDiscovering(false)
    setEditing(null)
  }
  async function discover() {
    const requestVersion = ++discoveryVersion.current
    setDiscovering(true)
    try {
      const response = editing?.id && !form.api_key.trim()
        ? await fetchStoredModels(editing.id)
        : await fetchAvailableLLMModels({ provider: form.provider, api_key: form.api_key || null, base_url: form.base_url || null })
      if (requestVersion === discoveryVersion.current) {
        setModels(response.models)
        setForm((current) => ({ ...current, models: current.models.filter((model) => response.models.includes(model)) }))
        setError('')
      }
    } catch (problem) { if (requestVersion === discoveryVersion.current) setError(problem.message) }
    finally { if (requestVersion === discoveryVersion.current) setDiscovering(false) }
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const body = { ...form, model_prices: form.model_prices.filter((item) => item.input_usd_per_million !== '' && item.output_usd_per_million !== '').map(({ model, input_usd_per_million, output_usd_per_million }) => ({ model, input_usd_per_million, output_usd_per_million })), api_key: form.api_key || null, base_url: form.provider === 'ollama' ? form.base_url || null : null }
      const response = editing?.id ? await updateLLMIntegration(editing.id, body) : await createLLMIntegration(body)
      setMessage(response.message); setFieldErrors({}); closeEditor(); await refresh()
    } catch (problem) { setError(problem.message); setFieldErrors(problem.fieldErrors || {}) }
    finally { setBusy(false) }
  }
  async function toggle(item) {
    const target = item.status === 'active' ? 'archived' : 'active'
    if (target === 'archived' && !window.confirm(`Archive ${item.account_name}? Explicit policy references must be removed first.`)) return
    setBusy(true)
    try { await setIntegrationStatus(item.id, target, item.version); await refresh() }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  return <div className="admin-stack">
    <div className="admin-toolbar"><p>Credentials are encrypted at rest and are never returned to the browser.</p><button className="btn primary" onClick={() => open()}>New integration</button></div>
    {message && <div className="admin-notice" role="status">{message}</div>}{error && <div className="admin-error" role="alert">{error}</div>}
    <DataTable title="Provider connections" description="Organization-owned accounts and the models enabled for Prompt Studio." rows={items} emptyTitle="Connect your first provider" emptyDescription="Add a provider account and choose its models to enable Prompt Studio." columns={[
      { id: 'account', label: 'Account', value: (item) => item.account_name, render: (item) => <div className="person-cell"><span className="person-monogram">{item.provider?.[0]?.toUpperCase()}</span><strong>{item.account_name}</strong></div> },
      { id: 'provider', label: 'Provider', value: (item) => item.provider, className: 'capitalize' },
      { id: 'models', label: 'Enabled models', value: (item) => item.models.length, render: (item) => <div className="table-models">{item.models.map((model) => <span className="model-chip" key={model}>{model}</span>)}</div> },
      { id: 'credential', label: 'Credential', render: (item) => <span className="credential-masked">{item.has_api_key ? item.masked_api_key : 'None'}</span> },
      { id: 'policies', label: 'Policies', value: (item) => item.policy_count || 0, render: (item) => <a href={`#policies?integration_id=${item.id}`}>{item.policy_count || 0} policies</a> },
      { id: 'status', label: 'Status', value: (item) => item.status, render: (item) => <StatusBadge status={item.status} /> },
      { id: 'actions', label: 'Actions', required: true, render: (item) => <div className="table-actions"><button className="btn" onClick={() => open(item)}>Edit</button><button className="btn" disabled={busy} onClick={() => toggle(item)}>{item.status === 'active' ? 'Archive' : 'Restore'}</button></div> },
    ]} />
    <Pagination page={page} total={total} onPageChange={setPage} noun="integrations" />
    {editing && <Modal title={editing.id ? 'Edit integration' : 'New integration'} onClose={closeEditor} dirty><form onSubmit={save} className="admin-stack"><label>Provider<select value={form.provider} disabled={Boolean(editing.id)} onChange={(event) => { discoveryVersion.current += 1; setForm({ ...form, provider: event.target.value, models: [] }); setModels([]) }}>{providers.map((value) => <option key={value}>{value}</option>)}</select><FieldErrors errors={fieldErrors} field="provider" /></label><label>Account name<input autoFocus required minLength="2" value={form.account_name} onChange={(event) => setForm({ ...form, account_name: event.target.value })} /><FieldErrors errors={fieldErrors} field="account_name" /></label><label>API key {editing.id ? '(leave blank to keep current)' : form.provider === 'ollama' ? '(optional)' : '(required)'}<input type="password" autoComplete="off" required={!editing.id && form.provider !== 'ollama'} value={form.api_key} onChange={(event) => { discoveryVersion.current += 1; setForm({ ...form, api_key: event.target.value, models: [] }); setModels([]) }} /><FieldErrors errors={fieldErrors} field="api_key" /></label>
      {form.provider === 'ollama' && <label>Allowed Ollama origin<input placeholder="http://127.0.0.1:11434" value={form.base_url} onChange={(event) => { discoveryVersion.current += 1; setForm({ ...form, base_url: event.target.value, models: [] }); setModels([]) }} /><FieldErrors errors={fieldErrors} field="base_url" /></label>}
      <div><button type="button" className="btn" disabled={discovering} onClick={discover}>{discovering ? 'Loading models…' : 'Discover models'}</button></div>
      <fieldset><legend>Enabled models</legend><div className="admin-options">{models.length ? models.map((model) => <label key={model}><input type="checkbox" checked={form.models.includes(model)} onChange={() => setForm({ ...form, models: form.models.includes(model) ? form.models.filter((item) => item !== model) : [...form.models, model] })} /> {model}</label>) : 'Discover models, then select at least one.'}</div><FieldErrors errors={fieldErrors} field="models" /></fieldset>
      <fieldset><legend>Estimated price per million tokens · USD</legend><p>Optional price overrides, not provider billing data. Leave both blank to use automatic LiteLLM pricing. Unsupported models and local inference need custom prices.</p>{form.models.map((model) => { const price = form.model_prices.find((item) => item.model === model) || { model, input_usd_per_million: '', output_usd_per_million: '' }; const changePrice = (field, value) => setForm((current) => ({ ...current, model_prices: [...current.model_prices.filter((item) => item.model !== model), { ...price, [field]: value }] })); return <div className="admin-grid two" key={model}><label>{model} input<input inputMode="decimal" value={price.input_usd_per_million} onChange={(event) => changePrice('input_usd_per_million', event.target.value)} /></label><label>{model} output<input inputMode="decimal" value={price.output_usd_per_million} onChange={(event) => changePrice('output_usd_per_million', event.target.value)} /></label></div> })}<FieldErrors errors={fieldErrors} field="model_prices" /></fieldset>
      <label>System instructions (admin-managed)<textarea maxLength="12000" value={form.system_prompt} onChange={(event) => setForm({ ...form, system_prompt: event.target.value })} /><FieldErrors errors={fieldErrors} field="system_prompt" /></label>
      {error && <div className="admin-error" role="alert">{error}</div>}<div className="admin-actions"><button type="button" className="btn" disabled={busy} onClick={closeEditor}>Cancel</button><button className="btn primary" disabled={busy || form.models.length === 0}>{busy ? 'Saving…' : 'Save integration'}</button></div></form></Modal>}
  </div>
}
