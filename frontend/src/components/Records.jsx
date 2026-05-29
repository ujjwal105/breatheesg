import { useState } from 'react'
import Inspector from './Inspector.jsx'

const SCOPE_OPTS = [
  { label: 'All scopes', value: '' },
  { label: 'Scope 1', value: 'scope_1' },
  { label: 'Scope 2', value: 'scope_2' },
  { label: 'Scope 3', value: 'scope_3' },
]
const STATUS_OPTS = [
  { label: 'Any status', value: '' },
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]
const SOURCE_OPTS = [
  { label: 'All sources', value: '' },
  { label: 'SAP', value: 'sap' },
  { label: 'Utility', value: 'utility' },
  { label: 'Travel', value: 'travel' },
]
const VALIDATION_OPTS = [
  { label: 'Any validation', value: '' },
  { label: 'Valid', value: 'valid' },
  { label: 'Warning', value: 'warning' },
  { label: 'Failed', value: 'failed' },
]

export default function Records({ records, total, filters, setFilters, tenant, showToast, onRefresh, loading }) {
  const [selected, setSelected] = useState(null)

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  function clearFilters() {
    setFilters({ source_type: '', scope_category: '', review_status: '', validation_status: '', has_flags: '', batch_id: '' })
  }

  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <div className="page records-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Review</p>
          <h1 className="page-title">
            Records
            <span className="title-count">{loading ? '…' : total}</span>
          </h1>
        </div>
        <button className="btn-secondary" onClick={onRefresh}>↺ Refresh</button>
      </header>

      <div className="filter-bar">
        <FilterSelect label="Source" opts={SOURCE_OPTS} value={filters.source_type} onChange={(v) => setFilter('source_type', v)} />
        <FilterSelect label="Scope" opts={SCOPE_OPTS} value={filters.scope_category} onChange={(v) => setFilter('scope_category', v)} />
        <FilterSelect label="Status" opts={STATUS_OPTS} value={filters.review_status} onChange={(v) => setFilter('review_status', v)} />
        <FilterSelect label="Validation" opts={VALIDATION_OPTS} value={filters.validation_status} onChange={(v) => setFilter('validation_status', v)} />
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.has_flags === 'true'}
            onChange={(e) => setFilter('has_flags', e.target.checked ? 'true' : '')}
          />
          <span>Suspicious only</span>
        </label>
        {hasActiveFilters && (
          <button className="btn-ghost" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      {filters.batch_id && (
        <div className="active-filter-chip">
          Filtered to batch #{filters.batch_id}
          <button onClick={() => setFilter('batch_id', '')}>✕</button>
        </div>
      )}

      <div className={`records-layout ${selected ? 'with-inspector' : ''}`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Source</th>
                <th>Activity</th>
                <th>Scope</th>
                <th>Emissions</th>
                <th>Amount</th>
                <th>Validation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  className={[
                    selected?.id === r.id ? 'selected' : '',
                    r.suspicion_flags?.length ? 'has-flags' : '',
                  ].join(' ')}
                >
                  <td className="col-id">
                    {r.suspicion_flags?.length > 0 && <span className="flag-dot" title="Has warnings" />}
                    #{r.id}
                  </td>
                  <td>
                    <span className={`badge badge-src-${r.source_type}`}>{r.source_type}</span>
                  </td>
                  <td>
                    <div className="stacked">
                      <strong>{r.activity_category}</strong>
                      <span>{r.activity_kind || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`scope-pill scope-${r.scope_category}`}>{scopeShort(r.scope_category)}</span>
                  </td>
                  <td className="col-num">
                    {r.emissions_kg_co2e ? `${fmtNum(r.emissions_kg_co2e)} kg` : '—'}
                  </td>
                  <td className="col-num">
                    {r.amount ? `${r.currency} ${fmtNum(r.amount)}` : '—'}
                  </td>
                  <td>
                    <span className={`badge badge-val-${r.validation_status}`}>{r.validation_status}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${r.review_status}`}>{r.review_status?.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No records match the current filters.
                  </td>
                </tr>
              )}
              {loading && records.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">Loading…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Inspector
          record={selected}
          tenant={tenant}
          showToast={showToast}
          onUpdated={onRefresh}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  )
}

function FilterSelect({ label, opts, value, onChange }) {
  return (
    <label className="filter-select-wrap">
      <span className="filter-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="filter-select">
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function scopeShort(s) {
  return s?.replace('scope_', 'S') || '—'
}

function fmtNum(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v
}
