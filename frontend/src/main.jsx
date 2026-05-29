import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function apiUrl(path) {
  return `${API_BASE_URL}${path}`
}

const SOURCE_COPY = {
  sap: {
    label: 'SAP Ariba export',
    helper: 'CSV upload for plant-level fuel and procurement rows. Supports noisy units, German headers, and inconsistent dates.',
    sample: `posting_date,document_id,document_type,commodity,unit,quantity,amount,currency,supplier,plant_code,emission_factor
2025-05-02,PO-88421,FUEL,DIESEL B5,liter,2450,184500,INR,HPCL,BLR-PLT-01,2.68
2025-05-04,PO-88426,PROCUREMENT,PACKAGING CARTONS,each,1200,54000,INR,GreenPack,BLR-DC-03,0.41`,
  },
  utility: {
    label: 'Utility portal CSV',
    helper: 'CSV upload for electricity bills or portal exports. Keeps billing periods separate from calendar months.',
    sample: `invoice_id,bill_number,billing_start,billing_end,usage_kwh,total_amount,currency,utility_provider,site_name,tariff_code,grid_factor_kg_per_kwh
UT-10091,EB-4432,2025-04-14,2025-05-15,18240,164820,INR,Tata Power,BLR HQ,LT-INR,0.69
UT-10092,EB-4433,2025-05-15,2025-06-14,17488,158220,INR,Tata Power,BLR HQ,LT-INR,0.69`,
  },
  travel: {
    label: 'Concur receipts JSON',
    helper: 'JSON upload for air, hotel, and ground transport receipts. Airport codes can be used when distance is missing.',
    sample: JSON.stringify(
      {
        source_type: 'travel',
        source_system: 'SAP Concur receipts API',
        rows: [
          {
            type: 'air',
            booking_id: 'TRV-9001',
            origin_airport: 'DEL',
            destination_airport: 'BLR',
            travel_date: '2025-05-07',
            amount: 12480,
            currency: 'INR',
            supplier: 'IndiGo',
            fare_class: 'Economy',
          },
          {
            type: 'hotel',
            booking_id: 'TRV-9002',
            hotel: 'ITC Gardenia',
            check_in: '2025-05-07',
            check_out: '2025-05-09',
            nights: 2,
            amount: 18400,
            currency: 'INR',
            supplier: 'Marriott',
          },
          {
            type: 'ground',
            booking_id: 'TRV-9003',
            route: 'BLR airport to office',
            date: '2025-05-09',
            distance_km: 38,
            amount: 980,
            currency: 'INR',
            supplier: 'Uber',
          },
        ],
      },
      null,
      2,
    ),
  },
}

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Scope 1', value: 'scope_1' },
  { label: 'Scope 2', value: 'scope_2' },
  { label: 'Scope 3', value: 'scope_3' },
]

const REVIEW_FILTERS = [
  { label: 'Any', value: '' },
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

function formatDecimal(value) {
  if (value == null || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value)
}

function App() {
  const [tenant, setTenant] = useState('demo-acme')
  const [overview, setOverview] = useState(null)
  const [batches, setBatches] = useState([])
  const [records, setRecords] = useState([])
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [auditTrail, setAuditTrail] = useState([])
  const [scopeFilter, setScopeFilter] = useState('')
  const [reviewFilter, setReviewFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    source_type: 'sap',
    source_system: SOURCE_COPY.sap.label,
    ingestion_mode: 'csv',
    filename: '',
    payload: SOURCE_COPY.sap.sample,
  })

  useEffect(() => {
    setForm((current) => ({
      ...current,
      source_system: SOURCE_COPY[current.source_type].label,
      ingestion_mode: current.source_type === 'travel' ? 'json' : 'csv',
      payload: SOURCE_COPY[current.source_type].sample,
    }))
  }, [form.source_type])

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, scopeFilter, reviewFilter])

  async function loadAll() {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      query.set('tenant', tenant)
      if (scopeFilter) query.set('scope_category', scopeFilter)
      if (reviewFilter) query.set('review_status', reviewFilter)
      const [overviewRes, batchesRes, recordsRes] = await Promise.all([
        fetch(apiUrl(`/api/overview/?tenant=${encodeURIComponent(tenant)}`)),
        fetch(apiUrl(`/api/batches/?tenant=${encodeURIComponent(tenant)}`)),
        fetch(apiUrl(`/api/records/?${query.toString()}`)),
      ])
      setOverview(await overviewRes.json())
      setBatches((await batchesRes.json()).results || [])
      setRecords((await recordsRes.json()).results || [])
    } catch (error) {
      setMessage(`Unable to load data: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function uploadData(event) {
    event.preventDefault()
    setMessage('')
    try {
      const sourceType = form.source_type
      const payload = new FormData()
      payload.append('tenant', tenant)
      payload.append('source_type', sourceType)
      payload.append('ingestion_mode', form.ingestion_mode)
      payload.append('source_system', form.source_system)
      if (form.file) {
        payload.append('file', form.file)
      } else {
        payload.append('payload', form.payload)
        payload.append('filename', form.filename || `${sourceType}-sample.${sourceType === 'travel' ? 'json' : 'csv'}`)
      }
      const response = await fetch(apiUrl('/api/imports/?tenant=' + encodeURIComponent(tenant)), {
        method: 'POST',
        body: payload,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Import failed')
      }
      setMessage(`Imported ${data.summary.rows_created} rows from ${data.batch.source_system}.`)
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function openRecord(record) {
    setSelectedRecord(record)
    const response = await fetch(apiUrl(`/api/records/${record.id}/detail/?tenant=${encodeURIComponent(tenant)}`))
    const data = await response.json()
    setSelectedRecord(data.record)
    setAuditTrail(data.audit || [])
  }

  async function updateRecord(patch) {
    if (!selectedRecord) return
    const response = await fetch(apiUrl(`/api/records/${selectedRecord.id}/?tenant=${encodeURIComponent(tenant)}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Actor': 'analyst',
      },
      body: JSON.stringify(patch),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || 'Update failed')
      return
    }
    setSelectedRecord(data.record)
    await loadAll()
  }

  async function decide(action) {
    if (!selectedRecord) return
    const response = await fetch(apiUrl(`/api/records/${selectedRecord.id}/?tenant=${encodeURIComponent(tenant)}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Actor': 'analyst',
      },
      body: JSON.stringify({ action }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || 'Action failed')
      return
    }
    setSelectedRecord(data.record)
    setMessage(`${action === 'approve' ? 'Approved' : 'Rejected'} record ${data.record.id}.`)
    await loadAll()
  }

  const stats = useMemo(() => {
    const counts = overview?.counts || {}
    return [
      { label: 'Batches', value: counts.batches ?? 0 },
      { label: 'Records', value: counts.records ?? 0 },
      { label: 'Queue', value: counts.review_queue ?? 0 },
      { label: 'Suspicious', value: counts.suspicious ?? 0 },
    ]
  }, [overview])

  return (
    <div className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="hero">
        <div>
          <p className="eyebrow">Breathe ESG prototype</p>
          <h1>Ingest, normalize, review, approve.</h1>
          <p className="lede">
            A single analyst console for SAP exports, utility bills, and travel receipts with audit history and tenant isolation.
          </p>
        </div>
        <div className="tenant-pill">
          <span>Tenant</span>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} />
        </div>
      </header>

      <section className="stats-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{loading ? '…' : formatDecimal(item.value)}</strong>
          </article>
        ))}
        <article className="stat-card accent">
          <span>Latest batch</span>
          <strong>{overview?.latest_batch ? overview.latest_batch.source_system : 'None yet'}</strong>
        </article>
      </section>

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ingestion</p>
              <h2>Load source data</h2>
            </div>
          </div>

          <div className="source-switcher">
            {Object.entries(SOURCE_COPY).map(([key, copy]) => (
              <button
                key={key}
                className={form.source_type === key ? 'chip active' : 'chip'}
                onClick={() =>
                  setForm({
                    source_type: key,
                    source_system: copy.label,
                    ingestion_mode: key === 'travel' ? 'json' : 'csv',
                    filename: '',
                    payload: copy.sample,
                  })
                }
                type="button"
              >
                {copy.label}
              </button>
            ))}
          </div>

          <p className="help-copy">{SOURCE_COPY[form.source_type].helper}</p>

          <form onSubmit={uploadData} className="upload-form">
            <label>
              Source system
              <input
                value={form.source_system}
                onChange={(e) => setForm((current) => ({ ...current, source_system: e.target.value }))}
              />
            </label>
            <label>
              Filename
              <input
                value={form.filename}
                onChange={(e) => setForm((current) => ({ ...current, filename: e.target.value }))}
                placeholder="optional"
              />
            </label>
            <label>
              File upload
              <input
                type="file"
                accept={form.source_type === 'travel' ? '.json,application/json' : '.csv,text/csv'}
                onChange={(e) => setForm((current) => ({ ...current, file: e.target.files?.[0] || null }))}
              />
            </label>
            <label className="textarea-field">
              Payload paste
              <textarea
                value={form.payload}
                onChange={(e) => setForm((current) => ({ ...current, payload: e.target.value }))}
                rows={14}
              />
            </label>
            <div className="form-actions">
              <button className="primary" type="submit">
                Import rows
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setForm((current) => ({ ...current, payload: SOURCE_COPY[current.source_type].sample }))}
              >
                Reset sample
              </button>
            </div>
          </form>
          {message ? <p className="message">{message}</p> : null}
        </section>

        <section className="panel wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Review</p>
              <h2>Rows awaiting analyst sign-off</h2>
            </div>
            <div className="filters">
              <div className="segmented">
                {FILTERS.map((item) => (
                  <button
                    key={item.value || 'all'}
                    type="button"
                    className={scopeFilter === item.value ? 'seg active' : 'seg'}
                    onClick={() => setScopeFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="segmented">
                {REVIEW_FILTERS.map((item) => (
                  <button
                    key={item.value || 'any'}
                    type="button"
                    className={reviewFilter === item.value ? 'seg active' : 'seg'}
                    onClick={() => setReviewFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="content-grid">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Source</th>
                    <th>Category</th>
                    <th>Scope</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} onClick={() => openRecord(record)} className={selectedRecord?.id === record.id ? 'selected' : ''}>
                      <td>#{record.id}</td>
                      <td>{record.source_type}</td>
                      <td>
                        <div className="stacked">
                          <strong>{record.activity_category}</strong>
                          <span>{record.activity_kind || 'n/a'}</span>
                        </div>
                      </td>
                      <td>{record.scope_category}</td>
                      <td>{record.currency} {formatDecimal(record.amount)}</td>
                      <td>
                        <span className={`badge ${record.review_status}`}>{record.review_status}</span>
                      </td>
                    </tr>
                  ))}
                  {!records.length ? (
                    <tr>
                      <td colSpan={6} className="empty">
                        No records loaded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <aside className="inspector">
              <div className="inspector-head">
                <p className="panel-kicker">Inspector</p>
                <h3>{selectedRecord ? `Record #${selectedRecord.id}` : 'Select a row'}</h3>
              </div>

              {selectedRecord ? (
                <>
                  <dl className="detail-grid">
                    <div>
                      <dt>Source</dt>
                      <dd>{selectedRecord.source_type}</dd>
                    </div>
                    <div>
                      <dt>Scope</dt>
                      <dd>{selectedRecord.scope_category}</dd>
                    </div>
                    <div>
                      <dt>Quantity</dt>
                      <dd>
                        {formatDecimal(selectedRecord.quantity)} {selectedRecord.quantity_unit}
                      </dd>
                    </div>
                    <div>
                      <dt>Emissions</dt>
                      <dd>{formatDecimal(selectedRecord.emissions_kg_co2e)} kgCO2e</dd>
                    </div>
                  </dl>

                  <label>
                    Notes
                    <textarea
                      value={selectedRecord.notes || ''}
                      onChange={(e) => setSelectedRecord((current) => ({ ...current, notes: e.target.value }))}
                      rows={4}
                    />
                  </label>

                  <div className="edit-grid">
                    {['supplier', 'location', 'origin', 'destination', 'commodity'].map((field) => (
                      <label key={field}>
                        {field}
                        <input
                          value={selectedRecord[field] || ''}
                          onChange={(e) => setSelectedRecord((current) => ({ ...current, [field]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="form-actions">
                    <button className="secondary" type="button" onClick={() => updateRecord({ notes: selectedRecord.notes })}>
                      Save notes
                    </button>
                    <button className="secondary" type="button" onClick={() => updateRecord({
                      supplier: selectedRecord.supplier,
                      location: selectedRecord.location,
                      origin: selectedRecord.origin,
                      destination: selectedRecord.destination,
                      commodity: selectedRecord.commodity,
                    })}>
                      Save edits
                    </button>
                  </div>

                  <div className="form-actions">
                    <button className="primary" type="button" onClick={() => decide('approve')}>
                      Approve
                    </button>
                    <button className="danger" type="button" onClick={() => decide('reject')}>
                      Reject
                    </button>
                  </div>

                  <section className="audit">
                    <h4>Audit trail</h4>
                    {auditTrail.length ? (
                      auditTrail.map((event) => (
                        <article key={event.id} className="audit-item">
                          <strong>{event.action}</strong>
                          <span>{event.actor_name} · {new Date(event.created_at).toLocaleString()}</span>
                        </article>
                      ))
                    ) : (
                      <p>No audit entries yet.</p>
                    )}
                  </section>
                </>
              ) : (
                <p className="empty-inspector">Select a row to inspect the normalized payload and review state.</p>
              )}
            </aside>
          </div>

          <section className="batches">
            <h3>Recent batches</h3>
            <div className="batch-list">
              {batches.map((batch) => (
                <article key={batch.id} className="batch-card">
                  <strong>{batch.source_system}</strong>
                  <span>{batch.source_type} · {batch.status}</span>
                  <span>{batch.row_count} rows · {batch.warning_count} warnings</span>
                </article>
              ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
