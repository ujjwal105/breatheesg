from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from ingest.models import AuditEvent, IngestionBatch, NormalizedRecord, Tenant
from ingest.services import fingerprint_record, normalize_uploaded_row, parse_uploaded_rows, record_to_dict


class Command(BaseCommand):
    help = "Seed a demo tenant with one batch per source so the dashboard opens with data."

    def handle(self, *args, **options):
        tenant, _ = Tenant.objects.get_or_create(slug="demo-acme", defaults={"name": "Demo Acme"})

        if NormalizedRecord.objects.filter(tenant=tenant).exists():
            self.stdout.write(self.style.WARNING("Demo tenant already has records; skipping seed."))
            return

        payloads = [
            (
                IngestionBatch.SourceType.SAP,
                IngestionBatch.IngestionMode.CSV,
                "SAP Ariba export",
                "posting_date,document_id,document_type,commodity,unit,quantity,amount,currency,supplier,plant_code,emission_factor\n2025-05-02,PO-88421,FUEL,DIESEL B5,liter,2450,184500,INR,HPCL,BLR-PLT-01,2.68",
            ),
            (
                IngestionBatch.SourceType.UTILITY,
                IngestionBatch.IngestionMode.CSV,
                "Utility portal CSV",
                "invoice_id,bill_number,billing_start,billing_end,usage_kwh,total_amount,currency,utility_provider,site_name,tariff_code,grid_factor_kg_per_kwh\nUT-10091,EB-4432,2025-04-14,2025-05-15,18240,164820,INR,Tata Power,BLR HQ,LT-INR,0.69",
            ),
            (
                IngestionBatch.SourceType.TRAVEL,
                IngestionBatch.IngestionMode.JSON,
                "SAP Concur receipts API",
                json.dumps(
                    {
                        "source_type": "travel",
                        "rows": [
                            {
                                "type": "air",
                                "booking_id": "TRV-9001",
                                "origin_airport": "DEL",
                                "destination_airport": "BLR",
                                "travel_date": "2025-05-07",
                                "amount": 12480,
                                "currency": "INR",
                                "supplier": "IndiGo",
                            }
                        ],
                    }
                ),
            ),
        ]

        for source_type, ingestion_mode, source_system, raw_text in payloads:
            batch = IngestionBatch.objects.create(
                tenant=tenant,
                source_type=source_type,
                ingestion_mode=ingestion_mode,
                source_system=source_system,
                raw_payload=raw_text,
                status=IngestionBatch.BatchStatus.RECEIVED,
                row_count=0,
            )
            rows = parse_uploaded_rows(source_type, raw_text)
            created = 0
            warnings = 0
            for index, row in enumerate(rows, start=1):
                result = normalize_uploaded_row(tenant.slug, batch, row, index)
                payload = json.loads(json.dumps(result.normalized, default=str))
                record = NormalizedRecord.objects.create(
                    tenant=tenant,
                    batch=batch,
                    source_type=source_type,
                    source_system=source_system,
                    source_row_number=index,
                    source_fingerprint=fingerprint_record(row, index),
                    raw_payload=row,
                    normalized_payload=payload,
                    suspicion_flags=result.warnings,
                    scope_category=result.normalized["scope_category"],
                    validation_status=result.normalized["validation_status"],
                    review_status=NormalizedRecord.ReviewStatus.NEEDS_REVIEW,
                    is_locked=False,
                    **{
                        k: v
                        for k, v in result.normalized.items()
                        if k not in {"source_system", "review_status", "validation_status", "scope_category"}
                    },
                )
                AuditEvent.objects.create(
                    record=record,
                    actor_name="system",
                    action=AuditEvent.Action.IMPORTED,
                    before_state={},
                    after_state=record_to_dict(record),
                )
                created += 1
                warnings += 1 if result.warnings else 0
            batch.row_count = len(rows)
            batch.valid_count = created
            batch.warning_count = warnings
            batch.failed_count = 0
            batch.status = IngestionBatch.BatchStatus.READY
            batch.save()

        self.stdout.write(self.style.SUCCESS("Seeded demo-acme with SAP, utility, and travel rows."))
