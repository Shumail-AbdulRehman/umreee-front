// Synthetic API fixtures only. No customer records or real mutations.
const { chromium } = require('playwright')
const AxeBuilder = require('@axe-core/playwright').default
const assert = require('node:assert/strict')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5187'
const id = n => String(n).padStart(24, '0')
let browser
;(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage()
  page.setDefaultTimeout(15000)
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: id(i + 1), policy_name: `Data policy ${i + 1}`, category: 'dlp', severity: 'high', action: 'BLOCK', stage: 'input', resolution_status: 'open', resolution_note: '', policy_version: 2, version: 1, run_id: id(90 + i), created_at: '2026-10-20T09:30:00Z', findings: [{ type: 'email', field: 'prompt', outcome: 'fail' }] }))
  const errors = [], unexpected = [], updates = [], accessibility = []
  let role = 'org_admin', failDetail = false, slowDetail = false
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'synthetic-only'))
  await page.route(`${base}/api/**`, async route => {
    const req = route.request(), p = new URL(req.url()).pathname, method = req.method()
    const send = (json, status = 200) => route.fulfill({ json, status })
    if (p === '/api/auth/me') return send({ id: id(99), first_name: 'Ada', last_name: 'Morgan', email: 'ada@example.test', role, company: { id: id(80), name: 'Northstar Labs' } })
    if (p === '/api/notifications') return send({ items: [] })
    if (p === '/api/violations') return send({ items: rows, total: rows.length, page: 1, page_size: 20 })
    const row = rows.find(item => p === `/api/violations/${item.id}` || p === `/api/violations/${item.id}/resolution`)
    if (row && method === 'GET') {
      if (slowDetail) await new Promise(resolve => setTimeout(resolve, 700))
      if (failDetail) return send({ detail: { message: 'Unable to load this incident' } }, 503)
      return send({ violation: { ...row, findings: role === 'user' ? [{ type: 'email', outcome: 'fail' }] : row.findings } })
    }
    if (row && method === 'PATCH') {
      assert.equal(role, 'org_admin'); const body = req.postDataJSON(); updates.push({ id: row.id, body })
      assert.equal(body.version, row.version)
      Object.assign(row, { resolution_status: body.resolution_status, resolution_note: body.note, version: row.version + 1 })
      return send({ violation: row })
    }
    unexpected.push(`${method} ${p}`); return route.abort()
  })
  const dialog = () => page.getByRole('dialog', { name: 'Violation detail', exact: true })
  const open = async n => { await page.getByRole('button', { name: `Open violation for Data policy ${n}`, exact: true }).click(); await dialog().waitFor() }
  const ready = async n => dialog().getByRole('heading', { name: `Data policy ${n}`, exact: true }).waitFor()
  const audit = async name => { const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); result.violations.forEach(item => accessibility.push({ name, id: item.id, nodes: item.nodes.map(n => n.target) })) }
  await page.goto(`${base}/#violations`)
  await open(12); await ready(12)
  const box = await dialog().boundingBox(); assert.equal(box.y >= 0 && box.y + box.height <= 900, true)
  await dialog().getByLabel('Review note').fill('Reviewed by the security team.')
  await dialog().getByRole('button', { name: 'Mark reviewed', exact: true }).click()
  await dialog().locator('.status-badge').filter({ hasText: 'Reviewed' }).waitFor()
  assert.deepEqual(updates[0], { id: id(12), body: { resolution_status: 'reviewed', note: 'Reviewed by the security team.', version: 1 } })
  await dialog().getByRole('button', { name: 'Resolve', exact: true }).click()
  await dialog().locator('.status-badge').filter({ hasText: 'Resolved' }).waitFor()
  assert.equal(updates[1].body.version, 2)
  assert.equal(await dialog().getByRole('link', { name: /Open this run/ }).getAttribute('href'), `#prompt-studio?run_id=${id(101)}`)
  await audit('admin/desktop'); await page.screenshot({ path: '/tmp/averiq-violation-detail.png' })
  await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: 'Open violation for Data policy 12', exact: true }).evaluate(el => el === document.activeElement), true)
  failDetail = true; await open(1)
  await dialog().getByRole('alert').filter({ hasText: 'Unable to load this incident' }).waitFor()
  await audit('detail/error'); failDetail = false
  await dialog().getByRole('button', { name: 'Retry detail', exact: true }).click(); await ready(1)
  await page.keyboard.press('Escape')
  slowDetail = true; await open(1); await dialog().getByText('Loading incident details…', { exact: true }).waitFor()
  await page.keyboard.press('Escape'); slowDetail = false
  await open(2); await ready(2); await page.waitForTimeout(850)
  assert.equal(await dialog().getByRole('heading', { name: 'Data policy 1', exact: true }).count(), 0, 'Stale detail must not replace a later selection')
  await page.keyboard.press('Escape')
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 850 }); await open(12); await ready(12)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const rect = await dialog().boundingBox(); assert.equal(rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 850, true)
    await audit(`admin/${width}`); await page.screenshot({ path: `/tmp/averiq-violation-detail-${width}.png` })
    await page.keyboard.press('Escape')
  }
  role = 'user'; await page.goto(`${base}/#violations`); await page.reload(); await open(1); await ready(1)
  assert.equal(await dialog().getByRole('button', { name: /Mark reviewed|Resolve/ }).count(), 0)
  assert.equal(await dialog().innerText().then(text => text.includes('undefined')), false)
  assert.equal(updates.length, 2); await audit('user/read-only')
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(accessibility, [])
  console.log('PASS: Open immediately displays visible incident dialog; admin review/resolve payloads; safe evidence/run link; errors/retry; stale response isolation; focus return; user read-only permissions; desktop/tablet/mobile; zero axe or console errors.')
  await browser.close()
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1 })
