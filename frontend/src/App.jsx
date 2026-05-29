import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api.js'
import Overview from './components/Overview.jsx'
import Records from './components/Records.jsx'
import Import from './components/Import.jsx'
import Batches from './components/Batches.jsx'

const NAV = [
  { id: 'overview', label: 'Overview', icon: '◈' },
  { id: 'records', label: 'Records', icon: '≡' },
  { id: 'batches', label: 'Batches', icon: '⊞' },
  { id: 'import', label: 'Import', icon: '↑' },
]

export default function App() {
  const [page, setPage] = useState('overview')
  const [tenant, setTenant] = useState('demo-acme')
  const [tenantDraft, setTenantDraft] = useState('demo-acme')
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  const [overview, setOverview] = useState(null)
  const [records, setRecords] = useState([])
  const [recordsTotal, setRecordsTotal] = useState(0)
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const [filters, setFilters] = useState({
    source_type: '',
    scope_category: '',
    review_status: '',
    validation_status: '',
    has_flags: '',
    batch_id: '',
  })

  const showToast = useCallback((msg, type = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const themeLabel = useMemo(() => (
    theme === 'dark' ? 'Dark' : 'Light'
  ), [theme])

  const load = useCallback(async (currentTenant, currentFilters) => {
    setLoading(true)
    try {
      const [ov, rec, bat] = await Promise.all([
        api.getOverview(currentTenant),
        api.listRecords(currentTenant, currentFilters),
        api.listBatches(currentTenant),
      ])
      setOverview(ov)
      setRecords(rec.results || [])
      setRecordsTotal(rec.total ?? rec.results?.length ?? 0)
      setBatches(bat.results || [])
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load(tenant, filters)
  }, [tenant, filters, load])

  function commitTenant(e) {
    e.preventDefault()
    const slug = tenantDraft.trim().toLowerCase().replace(/\s+/g, '-') || 'demo-acme'
    setTenantDraft(slug)
    setTenant(slug)
  }

  function refresh() {
    load(tenant, filters)
  }

  return (
    <div className="shell">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
          <button className="toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-mark">B</span>
          <span className="logo-text">Breathe <em>ESG</em></span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <form onSubmit={commitTenant} className="tenant-form">
            <label className="tenant-label">Tenant</label>
            <input
              className="tenant-input"
              value={tenantDraft}
              onChange={(e) => setTenantDraft(e.target.value)}
              onBlur={commitTenant}
              spellCheck={false}
            />
          </form>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            <span className="theme-toggle-icon">{theme === 'dark' ? '☾' : '☀'}</span>
            {themeLabel} mode
          </button>
          {loading && <div className="sidebar-loading">Loading…</div>}
        </div>
      </aside>

      <main className="main">
        {page === 'overview' && (
          <Overview overview={overview} loading={loading} onNavigate={setPage} />
        )}
        {page === 'records' && (
          <Records
            records={records}
            total={recordsTotal}
            filters={filters}
            setFilters={setFilters}
            tenant={tenant}
            showToast={showToast}
            onRefresh={refresh}
            loading={loading}
          />
        )}
        {page === 'batches' && (
          <Batches
            batches={batches}
            loading={loading}
            onSelectBatch={(batchId) => {
              setFilters((f) => ({ ...f, batch_id: String(batchId) }))
              setPage('records')
            }}
          />
        )}
        {page === 'import' && (
          <Import
            tenant={tenant}
            showToast={showToast}
            onImported={() => {
              refresh()
              setPage('records')
            }}
          />
        )}
      </main>
    </div>
  )
}
