const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export function getOverview(tenant) {
  return req(`/api/overview/?tenant=${encodeURIComponent(tenant)}`)
}

export function listRecords(tenant, filters = {}) {
  const q = new URLSearchParams({ tenant })
  Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v) })
  return req(`/api/records/?${q}`)
}

export function getRecord(tenant, id) {
  return req(`/api/records/${id}/detail/?tenant=${encodeURIComponent(tenant)}`)
}

export function listBatches(tenant) {
  return req(`/api/batches/?tenant=${encodeURIComponent(tenant)}`)
}

export function importData(tenant, formData) {
  return req(`/api/imports/?tenant=${encodeURIComponent(tenant)}`, {
    method: 'POST',
    body: formData,
  })
}

export function patchRecord(tenant, id, patch) {
  return req(`/api/records/${id}/?tenant=${encodeURIComponent(tenant)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Actor': 'analyst' },
    body: JSON.stringify(patch),
  })
}

export function actionRecord(tenant, id, action) {
  return req(`/api/records/${id}/?tenant=${encodeURIComponent(tenant)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Actor': 'analyst' },
    body: JSON.stringify({ action }),
  })
}
