const STATUS_ORDER = ['received', 'parsed', 'partial', 'failed', 'ready', 'approved']

export default function Batches({ batches, loading, onSelectBatch }) {
  if (loading && !batches.length) {
    return (
      <div className="page">
        <header className="page-header">
          <div><p className="page-kicker">History</p><h1 className="page-title">Batches</h1></div>
        </header>
        <div className="skeleton-list">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 12 }} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-kicker">History</p>
          <h1 className="page-title">Batches <span className="title-count">{batches.length}</span></h1>
        </div>
      </header>

      {batches.length === 0 ? (
        <p className="muted">No batches yet. Import some data first.</p>
      ) : (
        <div className="batch-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Source</th>
                <th>System</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Warnings</th>
                <th>Failed</th>
                <th>Imported</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="col-id">#{b.id}</td>
                  <td><span className={`badge badge-src-${b.source_type}`}>{b.source_type}</span></td>
                  <td>{b.source_system}</td>
                  <td><span className={`badge badge-batch-${b.status}`}>{b.status}</span></td>
                  <td className="col-num">{b.row_count}</td>
                  <td className="col-num">
                    {b.warning_count > 0
                      ? <span className="warn-count">{b.warning_count}</span>
                      : <span className="muted">{b.warning_count}</span>
                    }
                  </td>
                  <td className="col-num">
                    {b.failed_count > 0
                      ? <span className="err-count">{b.failed_count}</span>
                      : <span className="muted">{b.failed_count}</span>
                    }
                  </td>
                  <td className="col-date">{new Date(b.created_at).toLocaleString()}</td>
                  <td>
                    <button className="btn-ghost small" onClick={() => onSelectBatch(b.id)}>
                      View records →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {batches.some((b) => b.notes) && (
            <div className="batch-notes">
              <p className="section-label">Parse notes</p>
              {batches.filter((b) => b.notes).map((b) => (
                <details key={b.id} className="note-detail">
                  <summary>Batch #{b.id} — {b.source_system}</summary>
                  <pre className="code-block small">{b.notes}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
