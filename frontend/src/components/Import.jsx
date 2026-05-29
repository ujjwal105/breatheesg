import { useRef, useState } from 'react'
import * as api from '../api.js'

const SOURCES = {
  sap: {
    label: 'SAP Ariba',
    icon: '📋',
    description: 'CSV export from SAP procurement or fuel data. Supports German headers, inconsistent units, and plant codes.',
    mode: 'csv',
    accept: '.csv,text/csv',
    sample: `posting_date,document_id,document_type,commodity,unit,quantity,amount,currency,supplier,plant_code,emission_factor
2025-05-02,PO-88421,FUEL,DIESEL B5,liter,2450,184500,INR,HPCL,BLR-PLT-01,2.68
2025-05-04,PO-88426,PROCUREMENT,PACKAGING CARTONS,each,1200,54000,INR,GreenPack,BLR-DC-03,0.41
2025-05-06,PO-88430,FUEL,PETROL 95,gallon,380,172400,INR,BPCL,BLR-PLT-01,
2025-05-10,PO-88445,PROCUREMENT,ELECTRICAL COMPONENTS,each,85,320000,INR,Schneider Electric,HYD-FAC-02,0.38`,
  },
  utility: {
    label: 'Utility Bills',
    icon: '⚡',
    description: 'Electricity billing CSV from utility portal. Handles billing periods that don\'t align to calendar months.',
    mode: 'csv',
    accept: '.csv,text/csv',
    sample: `invoice_id,bill_number,billing_start,billing_end,usage_kwh,total_amount,currency,utility_provider,site_name,tariff_code,grid_factor_kg_per_kwh
UT-10091,EB-4432,2025-04-14,2025-05-15,18240,164820,INR,Tata Power,BLR HQ,LT-INR,0.69
UT-10092,EB-4433,2025-05-15,2025-06-14,17488,158220,INR,Tata Power,BLR HQ,LT-INR,0.69
UT-10093,EB-9910,2025-04-01,2025-05-30,42100,378900,INR,BESCOM,HYD Plant,HT-INR,0.71`,
  },
  travel: {
    label: 'Travel (Concur)',
    icon: '✈',
    description: 'JSON receipts from SAP Concur covering air, hotel, and ground transport.',
    mode: 'json',
    accept: '.json,application/json',
    sample: JSON.stringify({
      source_type: 'travel',
      source_system: 'SAP Concur receipts API',
      rows: [
        { type: 'air', booking_id: 'TRV-9001', origin_airport: 'DEL', destination_airport: 'BLR', travel_date: '2025-05-07', amount: 12480, currency: 'INR', supplier: 'IndiGo', fare_class: 'Economy' },
        { type: 'hotel', booking_id: 'TRV-9002', hotel: 'ITC Gardenia', check_in: '2025-05-07', check_out: '2025-05-09', nights: 2, amount: 18400, currency: 'INR', supplier: 'Marriott' },
        { type: 'ground', booking_id: 'TRV-9003', route: 'BLR airport to office', date: '2025-05-09', distance_km: 38, amount: 980, currency: 'INR', supplier: 'Uber' },
        { type: 'air', booking_id: 'TRV-9004', origin_airport: 'BOM', destination_airport: 'SIN', travel_date: '2025-05-12', amount: 38200, currency: 'INR', supplier: 'Singapore Airlines', fare_class: 'Business' },
      ],
    }, null, 2),
  },
}

export default function Import({ tenant, showToast, onImported }) {
  const [sourceType, setSourceType] = useState('sap')
  const [payload, setPayload] = useState(SOURCES.sap.sample)
  const [sourceSystem, setSourceSystem] = useState(SOURCES.sap.label)
  const [filename, setFilename] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  function selectSource(key) {
    setSourceType(key)
    setSourceSystem(SOURCES[key].label)
    setPayload(SOURCES[key].sample)
    setFile(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('source_type', sourceType)
      form.append('ingestion_mode', SOURCES[sourceType].mode)
      form.append('source_system', sourceSystem)
      if (file) {
        form.append('file', file)
      } else {
        form.append('payload', payload)
        form.append('filename', filename || `${sourceType}-upload.${sourceType === 'travel' ? 'json' : 'csv'}`)
      }
      const data = await api.importData(tenant, form)
      setResult({ ok: true, summary: data.summary, batch: data.batch })
      showToast(`Imported ${data.summary.rows_created} rows successfully.`, 'success')
    } catch (err) {
      setResult({ ok: false, error: err.message })
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page import-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Ingestion</p>
          <h1 className="page-title">Import data</h1>
        </div>
      </header>

      <div className="import-layout">
        <div className="source-cards">
          {Object.entries(SOURCES).map(([key, src]) => (
            <button
              key={key}
              type="button"
              className={`source-card ${sourceType === key ? 'active' : ''}`}
              onClick={() => selectSource(key)}
            >
              <span className="source-icon">{src.icon}</span>
              <div>
                <p className="source-name">{src.label}</p>
                <p className="source-desc">{src.description}</p>
              </div>
            </button>
          ))}
        </div>

        <form className="import-form" onSubmit={submit}>
          <div className="form-row">
            <label className="form-field">
              Source system name
              <input
                value={sourceSystem}
                onChange={(e) => setSourceSystem(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              Filename <span className="optional">(optional)</span>
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={`${sourceType}-upload.${sourceType === 'travel' ? 'json' : 'csv'}`}
              />
            </label>
          </div>

          <label className="form-field">
            Upload file
            <div className="file-drop">
              <input
                ref={fileRef}
                type="file"
                accept={SOURCES[sourceType].accept}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  setFile(f)
                  if (f) setFilename(f.name)
                }}
              />
              <span className="file-hint">{file ? file.name : `Drop a ${SOURCES[sourceType].mode.toUpperCase()} file or click to browse`}</span>
            </div>
          </label>

          {!file && (
            <label className="form-field">
              Or paste payload <span className="optional">(sample pre-loaded)</span>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={12}
                className="mono"
              />
            </label>
          )}

          {file && (
            <div className="file-selected">
              <span>📎 {file.name}</span>
              <button type="button" className="btn-ghost small" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                Remove
              </button>
            </div>
          )}

          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Importing…' : 'Import rows'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setPayload(SOURCES[sourceType].sample); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
            >
              Reset sample
            </button>
          </div>

          {result && (
            <div className={`import-result ${result.ok ? 'ok' : 'err'}`}>
              {result.ok ? (
                <>
                  <p className="result-title">Import complete</p>
                  <div className="result-stats">
                    <span><strong>{result.summary.rows_seen}</strong> rows seen</span>
                    <span><strong>{result.summary.rows_created}</strong> created</span>
                    <span><strong>{result.summary.warnings}</strong> warnings</span>
                    <span><strong>{result.summary.failures}</strong> failed</span>
                  </div>
                  <button className="btn-primary mt-12" type="button" onClick={onImported}>
                    View records →
                  </button>
                </>
              ) : (
                <p className="result-error">{result.error}</p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
