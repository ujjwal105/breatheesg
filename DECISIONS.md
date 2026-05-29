# Decisions

## SAP

- Chosen shape: CSV export from SAP Ariba procurement/purchase order data.
- Why: SAP’s own procurement export docs describe CSV exports and ZIP bundles of CSV files, which is a realistic integration target for an enterprise prototype.
- What I handle: noisy headers, inconsistent dates, inconsistent units, fuel vs procurement classification, plant/site codes, and a simple amount/quantity normalization path.
- What I ignore: full IDoc/BAPI/OData implementation, SAP authentication, and lookup-table enrichment from real plant masters.

## Utility

- Chosen shape: utility portal CSV for electricity bills.
- Why: the Green Button Alliance docs emphasize that utility billing data is not standardized and billing periods vary by utility. A portal CSV is the simplest realistic prototype surface.
- What I handle: billing period start/end, kWh usage, tariff code, bill totals, and period-length warnings.
- What I ignore: PDF parsing, OCR, demand charges, and tariff line-item accounting.

## Travel

- Chosen shape: Concur-style receipts JSON for air, hotel, and ground transport.
- Why: SAP Concur exposes receipt schemas for air, hotel, and ground transport, which makes JSON the closest realistic prototype shape.
- What I handle: airport-code air travel, hotel nights, ride distance, and category-specific emission factors.
- What I ignore: OAuth flows, direct API pulls, and the full travel receipt schema surface.

## Ingestion mechanism

- I chose upload/paste for the prototype because the assignment explicitly says sample data is not provided and the first challenge is understanding real-world shapes.
- File upload works for SAP and utility CSVs.
- JSON upload/paste works for travel receipts.

## Analyst workflow

- I chose a single review console instead of separate pages for import, review, and audit.
- Reason: the reviewer needs to see what came in, what is suspicious, and what is approved in one place.
- This is a prototype, so speed of comprehension matters more than extensive navigation.

## Questions I would ask the PM

- Which emissions factor source should be treated as authoritative?
- Should analysts be allowed to edit a locked row, or must they create a correction row?
- What is the canonical tenant identifier in the real product?
- Is SAP procurement data expected to be spend-based, activity-based, or both?
- Should utility data support OCR/PDF extraction in v1, or is CSV sufficient?
- Are travel rows expected from Concur expense receipts, itinerary APIs, or both?
