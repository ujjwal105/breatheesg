import { useEffect, useState } from 'react'
import * as api from '../api.js'

const TABS = ['Details', 'Raw Data', 'Audit']

export default function Inspector({ record, tenant, showToast, onUpdated, onClose }) {
  const [tab, setTab] = useState('Details')
  const [detail, setDetail] = useState(null)
  const [audit, setAudit] = useState([])
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!record) return
    setDetail(null)
    setAudit([])
    setEdits({})
    setTab('Details')
    api.getRecord(tenant, record.id).then((data) => {
      setDetail(data.record)
      setAudit(data.audit || [])
    }).catch((err) => showToast(err.message, 'error'))
  }, [record?.id, tenant])

  const current = detail || record

  async function save() {
    if (!current || !Object.keys(edits).length) return
    setSaving(true)
    try {
      const data = await api.patchRecord(tenant, current.id, edits)
      setDetail(data.record)
      setEdits({})
      onUpdated()
      showToast('Record saved.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function decide(action) {
    if (!current) return
    setSaving(true)
    try {
      const data = await api.actionRecord(tenant, current.id, action)
      setDetail(data.record)
      onUpdated()
      showToast(`Record ${action === 'approve' ? 'approved and locked' : 'rejected'}.`, action === 'approve' ? 'success' : 'info')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function field(key) {
    return key in edits ? edits[key] : (current?.[key] ?? '')
  }

  function setField(key, value) {
    setEdits((e) => ({ ...e, [key]: value }))
  }

  if (!record) {
    return (
      <aside className="inspector inspector-empty">
        <p>Select a record to inspect</p>
      </aside>
    )
  }

  const flags = current?.suspicion_flags || []
  const isLocked = current?.is_locked

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <h3 className="inspector-title">Record #{current?.id}</h3>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="inspector-badges">
          <span className={`badge badge-src-${current?.source_type}`}>{current?.source_type}</span>
          <span className={`badge badge-${current?.review_status}`}>{current?.review_status?.replace('_', ' ')}</span>
          {isLocked && <span className="badge badge-locked">🔒 locked</span>}
        </div>
      </div>

      {flags.length > 0 && (
        <div className="flag-panel">
          <p className="flag-heading">⚠ Suspicion flags</p>
          {flags.map((f, i) => <p key={i} className="flag-item">{f}</p>)}
        </div>
      )}

      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === 'Details' && (
          <DetailsTab current={current} field={field} setField={setField} edits={edits} isLocked={isLocked} />
        )}
        {tab === 'Raw Data' && (
          <RawTab current={current} />
        )}
        {tab === 'Audit' && (
          <AuditTab audit={audit} />
        )}
      </div>

      {!isLocked && (
        <div className="inspector-actions">
          {Object.keys(edits).length > 0 && (
            <button className="btn-secondary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <div className="action-row">
            <button className="btn-approve" onClick={() => decide('approve')} disabled={saving}>
              Approve
            </button>
            <button className="btn-reject" onClick={() => decide('reject')} disabled={saving}>
              Reject
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

function DetailsTab({ current, field, setField, edits, isLocked }) {
  const EDITABLE = ['notes', 'supplier', 'vendor', 'commodity', 'location', 'origin', 'destination']

  return (
    <div className="details-tab">
      <div className="detail-grid">
        <DetailItem label="Activity" value={`${current?.activity_category} · ${current?.activity_kind || '—'}`} />
        <DetailItem label="Scope" value={current?.scope_category} />
        <DetailItem label="Quantity" value={current?.quantity ? `${fmtNum(current.quantity)} ${current.quantity_unit}` : '—'} />
        <DetailItem label="Normalised" value={current?.normalized_quantity ? `${fmtNum(current.normalized_quantity)} ${current.normalized_unit}` : '—'} />
        <DetailItem label="Emissions" value={current?.emissions_kg_co2e ? `${fmtNum(current.emissions_kg_co2e)} kgCO₂e` : '—'} />
        <DetailItem label="Emission factor" value={current?.emission_factor ?? '—'} />
        <DetailItem label="Amount" value={current?.amount ? `${current.currency} ${fmtNum(current.amount)}` : '—'} />
        <DetailItem label="Date" value={current?.activity_date ?? '—'} />
        <DetailItem label="Period" value={current?.period_start ? `${current.period_start} → ${current.period_end || '?'}` : '—'} />
        <DetailItem label="Confidence" value={current?.confidence_score ? `${Math.round(current.confidence_score * 100)}%` : '—'} />
        <DetailItem label="Validation" value={current?.validation_status} />
        <DetailItem label="Source doc" value={current?.source_document_id || '—'} />
      </div>

      <div className="edit-section">
        <p className="section-label">Editable fields</p>
        <div className="edit-fields">
          {EDITABLE.map((key) => (
            <label key={key} className={`edit-field ${key === 'notes' ? 'full-width' : ''}`}>
              <span>{key}</span>
              {key === 'notes' ? (
                <textarea
                  value={field(key)}
                  onChange={(e) => setField(key, e.target.value)}
                  rows={3}
                  disabled={isLocked}
                />
              ) : (
                <input
                  value={field(key)}
                  onChange={(e) => setField(key, e.target.value)}
                  disabled={isLocked}
                />
              )}
              {key in edits && <span className="edited-dot" title="unsaved change" />}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function RawTab({ current }) {
  return (
    <div className="raw-tab">
      <div className="raw-block">
        <p className="raw-heading">Original payload</p>
        <pre className="code-block">{JSON.stringify(current?.raw_payload, null, 2)}</pre>
      </div>
      <div className="raw-block">
        <p className="raw-heading">Normalised payload</p>
        <pre className="code-block">{JSON.stringify(current?.normalized_payload, null, 2)}</pre>
      </div>
    </div>
  )
}

function AuditTab({ audit }) {
  if (!audit.length) return <p className="muted">No audit events yet.</p>
  return (
    <div className="audit-timeline">
      {audit.map((event) => (
        <div key={event.id} className="audit-event">
          <div className="audit-dot" />
          <div className="audit-content">
            <div className="audit-top">
              <span className={`badge badge-action-${event.action}`}>{event.action}</span>
              <span className="audit-actor">{event.actor_name}</span>
            </div>
            <span className="audit-time">{new Date(event.created_at).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}

function fmtNum(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v
}
