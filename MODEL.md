# Data Model

The model is built around one rule: keep the raw source row, the normalized analytical record, and the analyst action history separate.

## Core entities

- `Tenant` is the multi-tenant boundary. Every batch, record, and audit event belongs to exactly one tenant. See [backend/ingest/models.py](/Users/ujjwaltyagi/Desktop/breatheesg/backend/ingest/models.py:7).
- `IngestionBatch` captures one import event: source type, source system, raw payload, filename, row counts, and batch status. See [backend/ingest/models.py](/Users/ujjwaltyagi/Desktop/breatheesg/backend/ingest/models.py:16).
- `NormalizedRecord` is the unit the analyst reviews. It stores the source metadata, normalized emissions fields, review state, lock state, and editable notes. See [backend/ingest/models.py](/Users/ujjwaltyagi/Desktop/breatheesg/backend/ingest/models.py:56).
- `AuditEvent` is the append-only trail of system import events and analyst edits/approvals/rejections. See [backend/ingest/models.py](/Users/ujjwaltyagi/Desktop/breatheesg/backend/ingest/models.py:156).

## Why this shape

- I did not split the model into separate tables per source. That would make the prototype harder to review and would not help the analyst workflow.
- I did not make the raw payload transient. The source row is preserved so the team can explain why a value was normalized a certain way.
- I did not collapse batch metadata into the record table. Batch-level metrics are useful for review and for tracing import failures.

## Multi-tenancy

- Tenant isolation is explicit at the database level through foreign keys on every business entity.
- The API resolves the current tenant from `?tenant=` or `X-Tenant-Slug`.
- There is no shared “global” review queue. All counts and tables are tenant-scoped.

## Source-of-truth tracking

Each normalized row keeps:

- `raw_payload`: the original uploaded row as received.
- `normalized_payload`: the transformed record snapshot.
- `source_system`: which system produced the row.
- `source_row_number`: which line in the upload this row came from.
- `source_fingerprint`: a hash of row number + payload to detect accidental duplicates.
- `source_received_at`: when the app ingested it.
- `edited_at` / `edited_by`: last analyst edit.
- `approved_at` / `approved_by`: final analyst sign-off.
- `is_locked`: whether the row is frozen for audit.
- `AuditEvent.before_state` / `after_state`: the exact transition history.

That combination gives enough provenance to answer “what came in, what changed, and who approved it.”

## Scope and normalization

- `scope_category` is stored on each record as `scope_1`, `scope_2`, or `scope_3`.
- `activity_category` and `activity_kind` distinguish the business activity from the source subtype.
- `quantity` / `quantity_unit` preserve the original unit.
- `normalized_quantity` / `normalized_unit` capture the canonical unit used for analysis.
- `emissions_kg_co2e` is stored when the source row includes or implies a factor.

## Audit and locking

- Imported rows start in `needs_review`.
- Edits reset a row back to `needs_review` and create a new `AuditEvent`.
- Approval sets `is_locked = true`, stamps the approval time, and prevents further mutation through the API.

## Practical constraints

- This prototype uses Django `JSONField` for payload snapshots because the assignment is about traceability, not relational purity.
- It does not attempt to normalize every possible emissions unit in the world.
- It keeps the data model small enough to explain in a review without hand-waving.
