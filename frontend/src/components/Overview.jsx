export default function Overview({ overview, loading, onNavigate }) {
  const counts = overview?.counts || {}
  const totals = overview?.totals || {}
  const scopeCounts = overview?.scope_counts || []
  const sourceCounts = overview?.source_counts || []
  const statusCounts = overview?.review_status_counts || []
  const latestBatch = overview?.latest_batch

  const totalRecords = counts.records || 0
  const emissionsKg = parseFloat(totals.emissions_kg_co2e || 0)
  const emissionsTonne = (emissionsKg / 1000).toFixed(2)

  const scopeTotal = scopeCounts.reduce((s, x) => s + x.count, 0) || 1
  const reviewTotal = statusCounts.reduce((s, x) => s + x.count, 0) || 1

  const SCOPE_COLOR = { scope_1: '#f7768e', scope_2: '#7aa2f7', scope_3: '#3dd9b3' }
  const SCOPE_LABEL = { scope_1: 'Scope 1', scope_2: 'Scope 2', scope_3: 'Scope 3' }
  const SOURCE_LABEL = { sap: 'SAP Ariba', utility: 'Utility', travel: 'Travel' }
  const STATUS_COLOR = { needs_review: '#e5a50a', approved: '#3dd9b3', rejected: '#f7768e' }
  const STATUS_LABEL = { needs_review: 'Needs review', approved: 'Approved', rejected: 'Rejected' }

  if (!overview && !loading) {
    return (
      <div className="page-empty">
        <p>No data yet. <button className="link-btn" onClick={() => onNavigate('import')}>Import your first batch →</button></p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Dashboard</p>
          <h1 className="page-title">Overview</h1>
        </div>
        <button className="btn-secondary" onClick={() => onNavigate('import')}>+ Import data</button>
      </header>

      <div className="kpi-grid">
        <KpiCard label="Total Records" value={loading ? '…' : fmt(counts.records)} sub="across all batches" />
        <KpiCard label="Review Queue" value={loading ? '…' : fmt(counts.review_queue)} sub="awaiting analyst sign-off" accent />
        <KpiCard label="Suspicious Rows" value={loading ? '…' : fmt(counts.suspicious)} sub="have warning flags" warn={counts.suspicious > 0} />
        <KpiCard label="Total Emissions" value={loading ? '…' : emissionsTonne} sub="tonnes CO₂e" />
      </div>

      <div className="ov-grid">
        <section className="card">
          <h3 className="card-title">Scope breakdown</h3>
          {scopeCounts.length === 0 && loading && <Skeleton />}
          {scopeCounts.map((item) => (
            <BarRow
              key={item.scope_category}
              label={SCOPE_LABEL[item.scope_category] || item.scope_category}
              count={item.count}
              total={scopeTotal}
              color={SCOPE_COLOR[item.scope_category] || '#9ca8c4'}
            />
          ))}
        </section>

        <section className="card">
          <h3 className="card-title">Review status</h3>
          {statusCounts.length === 0 && loading && <Skeleton />}
          {statusCounts.map((item) => (
            <BarRow
              key={item.review_status}
              label={STATUS_LABEL[item.review_status] || item.review_status}
              count={item.count}
              total={reviewTotal}
              color={STATUS_COLOR[item.review_status] || '#9ca8c4'}
            />
          ))}
        </section>

        <section className="card">
          <h3 className="card-title">Source breakdown</h3>
          {sourceCounts.length === 0 && loading && <Skeleton />}
          {sourceCounts.map((item) => (
            <BarRow
              key={item.source_type}
              label={SOURCE_LABEL[item.source_type] || item.source_type}
              count={item.count}
              total={totalRecords || 1}
              color="#7aa2f7"
            />
          ))}
        </section>

        <section className="card">
          <h3 className="card-title">Latest batch</h3>
          {latestBatch ? (
            <div className="latest-batch">
              <div className="lb-row">
                <span className="lb-label">Source</span>
                <span>{latestBatch.source_system}</span>
              </div>
              <div className="lb-row">
                <span className="lb-label">Status</span>
                <span className={`badge badge-${latestBatch.status}`}>{latestBatch.status}</span>
              </div>
              <div className="lb-row">
                <span className="lb-label">Rows</span>
                <span>{latestBatch.row_count} total · {latestBatch.warning_count} warnings · {latestBatch.failed_count} failed</span>
              </div>
              <div className="lb-row">
                <span className="lb-label">Imported</span>
                <span>{new Date(latestBatch.created_at).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <p className="muted">No batches yet.</p>
          )}
          <button className="btn-ghost mt-12" onClick={() => onNavigate('batches')}>View all batches →</button>
        </section>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, accent, warn }) {
  return (
    <article className={`kpi-card ${accent ? 'kpi-accent' : ''} ${warn ? 'kpi-warn' : ''}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value ?? '—'}</strong>
      <span className="kpi-sub">{sub}</span>
    </article>
  )
}

function BarRow({ label, count, total, color }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div className="bar-row">
      <div className="bar-meta">
        <span>{label}</span>
        <span className="muted">{count} <small>({pct}%)</small></span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="skeleton" />
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}
