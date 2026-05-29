# Sources

## SAP

- Researched format: SAP Ariba procurement export CSV and purchase-order export files.
- What I learned: SAP procurement exports are commonly delivered as CSV, often bundled in ZIP files, and new columns may be appended over time. That makes a flat CSV import realistic and intentionally messy.
- Sample data shape: `posting_date`, `document_id`, `document_type`, `commodity`, `unit`, `quantity`, `amount`, `currency`, `supplier`, `plant_code`, `emission_factor`.
- What would break in production: IDoc/BAPI/OData would require auth and schema handling; real plant codes would need master-data lookup; dates and units would vary by site.
- Sources:
  - [SAP Help Portal: Export of Purchase Orders](https://help.sap.com/docs/buying-invoicing/procurement-data-import-and-administration-guide/export-of-purchase-orders)
  - [SAP Help Portal: Purchase Order Data Files](https://help.sap.com/docs/buying-invoicing/procurement-data-import-and-administration-guide/purchase-order-data-files)
  - [SAP Help Portal: Purchase Order (OData V4)](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/91af7f8d3acd47da90d33aaacfcd0d59/c89eec80ec2043d980cb7b8c89e0a00a.html)

## Utility

- Researched format: Green Button utility usage and billing data guidance.
- What I learned: utility billing data is not standardized, billing periods often do not align to calendar months, and interval/usage summaries are the important normalized concepts.
- Sample data shape: `billing_start`, `billing_end`, `usage_kwh`, `total_amount`, `currency`, `utility_provider`, `site_name`, `tariff_code`, `grid_factor_kg_per_kwh`.
- What would break in production: portal CSVs vary widely by utility, PDF statements need OCR, and tariff logic can get far more complex than one row per bill.
- Sources:
  - [Green Button Alliance: Utility-Bill Data Mapping](https://www.greenbuttonalliance.org/utility-bill-data)
  - [Green Button Alliance: Usage Data](https://www.greenbuttonalliance.org/usage-data)
  - [Green Button Alliance: Interval Metering](https://www.greenbuttonalliance.org/fb04)

## Travel

- Researched format: SAP Concur receipts and travel receipt surfaces for air, hotel, and ground transport.
- What I learned: Concur exposes receipt schemas by travel modality, which makes JSON receipt-style data a good prototype shape. Air, hotel, and ground transport also imply different emissions logic.
- Sample data shape: `type`, `booking_id`, `origin_airport`, `destination_airport`, `travel_date`, `check_in`, `check_out`, `distance_km`, `amount`, `currency`, `supplier`.
- What would break in production: OAuth, pagination, rate limits, and exact receipt schema details would need to match Concur’s API contract.
- Sources:
  - [SAP Concur Developer Center: Receipts Endpoints](https://preview.developer.concur.com/api-reference/receipts/endpoints.html)
  - [SAP Concur Developer Center: Travel Receipts - Getting Started](https://preview.developer.concur.com/api-reference/travel-receipts/getting-started.html)
  - [SAP Concur Developer Center: Travel Allowance Calculation Results](https://preview.developer.concur.com/api-reference/travelallowance/v4.travelallowance-calculationresults-endpoints.html)

## Note on sample data

- I fabricated sample rows after researching the real-world source shapes.
- The point of the sample data is not to be statistically accurate.
- The point is to show the kinds of fields, gaps, and normalization challenges the reviewer should expect in production.
