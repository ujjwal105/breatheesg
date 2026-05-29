from __future__ import annotations

import json
from decimal import Decimal

from django.contrib.auth.models import AnonymousUser
from django.db import transaction
from django.db.models import Count, Sum
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import AuditEvent, IngestionBatch, NormalizedRecord, Tenant
from .services import (
    batch_to_dict,
    fingerprint_record,
    normalize_uploaded_row,
    parse_uploaded_rows,
    record_to_dict,
)


def get_tenant(request) -> Tenant:
    slug = request.GET.get("tenant") or request.headers.get("X-Tenant-Slug") or "demo-acme"
    tenant, _ = Tenant.objects.get_or_create(slug=slug, defaults={"name": slug.replace("-", " ").title()})
    return tenant


def get_actor_name(request) -> str:
    return request.headers.get("X-Actor") or "analyst"


def json_response(payload: dict, status: int = 200) -> JsonResponse:
    return JsonResponse(payload, status=status, safe=True, json_dumps_params={"indent": 2, "default": str})


@require_http_methods(["GET"])
def health(request):
    return json_response({"ok": True})


@require_http_methods(["GET"])
def overview(request):
    tenant = get_tenant(request)
    records = NormalizedRecord.objects.filter(tenant=tenant)
    batches = IngestionBatch.objects.filter(tenant=tenant)
    scope_counts = list(records.values("scope_category").annotate(count=Count("id")).order_by("scope_category"))
    source_counts = list(records.values("source_type").annotate(count=Count("id")).order_by("source_type"))
    status_counts = list(records.values("review_status").annotate(count=Count("id")).order_by("review_status"))
    review_queue = records.filter(review_status=NormalizedRecord.ReviewStatus.NEEDS_REVIEW).count()
    suspicious = records.exclude(suspicion_flags=[]).count()
    emissions = records.aggregate(total=Sum("emissions_kg_co2e"))["total"] or Decimal("0")
    last_batch = batches.first()
    return json_response(
        {
            "tenant": {"slug": tenant.slug, "name": tenant.name},
            "counts": {
                "batches": batches.count(),
                "records": records.count(),
                "review_queue": review_queue,
                "suspicious": suspicious,
            },
            "totals": {
                "emissions_kg_co2e": str(emissions),
            },
            "scope_counts": scope_counts,
            "source_counts": source_counts,
            "review_status_counts": status_counts,
            "latest_batch": batch_to_dict(last_batch) if last_batch else None,
        }
    )


@require_http_methods(["GET"])
def batches(request):
    tenant = get_tenant(request)
    items = [batch_to_dict(batch) for batch in IngestionBatch.objects.filter(tenant=tenant)]
    return json_response({"results": items})


@require_http_methods(["GET"])
def records(request):
    tenant = get_tenant(request)
    queryset = NormalizedRecord.objects.filter(tenant=tenant)
    source_type = request.GET.get("source_type")
    review_status = request.GET.get("review_status")
    scope_category = request.GET.get("scope_category")
    if source_type:
        queryset = queryset.filter(source_type=source_type)
    if review_status:
        queryset = queryset.filter(review_status=review_status)
    if scope_category:
        queryset = queryset.filter(scope_category=scope_category)
    items = [record_to_dict(record) for record in queryset[:500]]
    return json_response({"results": items})


@require_http_methods(["GET"])
def record_detail(request, record_id: int):
    tenant = get_tenant(request)
    record = get_object_or_404(NormalizedRecord, tenant=tenant, pk=record_id)
    return json_response({"record": record_to_dict(record), "audit": [serialize_audit(event) for event in record.audit_events.all()]})


@csrf_exempt
@require_http_methods(["POST"])
def import_records(request):
    tenant = get_tenant(request)
    content_type = request.headers.get("Content-Type", "")
    source_type = request.POST.get("source_type") or _json_field(request, "source_type")
    ingestion_mode = request.POST.get("ingestion_mode") or _json_field(request, "ingestion_mode")
    source_system = request.POST.get("source_system") or _json_field(request, "source_system")
    filename = ""
    raw_text = ""

    if request.FILES.get("file"):
        uploaded = request.FILES["file"]
        filename = uploaded.name
        raw_text = uploaded.read().decode("utf-8")
    elif "multipart/form-data" in content_type:
        raw_text = request.POST.get("payload", "")
        filename = request.POST.get("filename", "")
    else:
        body = request.body.decode("utf-8").strip()
        if body:
            try:
                decoded = json.loads(body)
            except json.JSONDecodeError:
                raw_text = body
            else:
                source_type = source_type or decoded.get("source_type")
                ingestion_mode = ingestion_mode or decoded.get("ingestion_mode")
                source_system = source_system or decoded.get("source_system")
                filename = decoded.get("filename", "")
                if isinstance(decoded.get("payload"), str):
                    raw_text = decoded["payload"]
                elif "rows" in decoded:
                    raw_text = json.dumps(decoded["rows"])
                else:
                    raw_text = json.dumps(decoded)

    source_type = source_type or IngestionBatch.SourceType.SAP
    ingestion_mode = ingestion_mode or (IngestionBatch.IngestionMode.JSON if source_type == IngestionBatch.SourceType.TRAVEL else IngestionBatch.IngestionMode.CSV)
    source_system = source_system or default_source_system(source_type)
    batch = IngestionBatch.objects.create(
        tenant=tenant,
        source_type=source_type,
        ingestion_mode=ingestion_mode,
        source_system=source_system,
        original_filename=filename,
        raw_payload=raw_text,
        status=IngestionBatch.BatchStatus.RECEIVED,
    )

    try:
        rows = parse_uploaded_rows(source_type, raw_text)
    except Exception as exc:
        batch.status = IngestionBatch.BatchStatus.FAILED
        batch.notes = f"Unable to parse upload: {exc}"
        batch.save(update_fields=["status", "notes", "updated_at"])
        return json_response({"error": batch.notes, "batch": batch_to_dict(batch)}, status=400)

    created_records: list[NormalizedRecord] = []
    warnings = 0
    failures = 0
    with transaction.atomic():
        for index, row in enumerate(rows, start=1):
            try:
                result = normalize_uploaded_row(tenant.slug, batch, row, index)
                suspicion_flags = list(result.warnings)
                if result.normalized.get("validation_status") == NormalizedRecord.ValidationStatus.WARNING:
                    warnings += 1
                normalized_payload = json.loads(json.dumps(result.normalized, default=str))
                record_payload = {
                    key: value
                    for key, value in result.normalized.items()
                    if key not in {"source_system", "review_status", "validation_status", "scope_category"}
                }
                record = NormalizedRecord.objects.create(
                    tenant=tenant,
                    batch=batch,
                    source_type=source_type,
                    source_system=source_system,
                    source_row_number=index,
                    source_fingerprint=fingerprint_record(row, index),
                    raw_payload=row,
                    normalized_payload=normalized_payload,
                    suspicion_flags=suspicion_flags,
                    scope_category=result.normalized["scope_category"],
                    validation_status=result.normalized["validation_status"],
                    review_status=NormalizedRecord.ReviewStatus.NEEDS_REVIEW,
                    is_locked=False,
                    **record_payload,
                )
                created_records.append(record)
                AuditEvent.objects.create(
                    record=record,
                    actor_name="system",
                    action=AuditEvent.Action.IMPORTED,
                    before_state={},
                    after_state=record_to_dict(record),
                )
            except Exception as exc:
                failures += 1
                if batch.notes:
                    batch.notes += "\n"
                batch.notes += f"Row {index}: {exc}"

    batch.row_count = len(rows)
    batch.valid_count = len(created_records)
    batch.warning_count = warnings
    batch.failed_count = failures
    batch.status = IngestionBatch.BatchStatus.READY if created_records else IngestionBatch.BatchStatus.FAILED
    batch.save()
    return json_response(
        {
            "batch": batch_to_dict(batch),
            "records": [record_to_dict(record) for record in created_records],
            "summary": {
                "rows_seen": len(rows),
                "rows_created": len(created_records),
                "warnings": warnings,
                "failures": failures,
            },
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["GET", "PATCH", "POST"])
def record_action(request, record_id: int):
    tenant = get_tenant(request)
    record = get_object_or_404(NormalizedRecord, tenant=tenant, pk=record_id)

    if request.method == "GET":
        return json_response({"record": record_to_dict(record), "audit": [serialize_audit(event) for event in record.audit_events.all()]})

    if record.is_locked and request.method != "GET":
        return json_response({"error": "Approved records are locked for audit."}, status=409)

    before = record_to_dict(record)
    payload = _json_body(request)
    actor_name = get_actor_name(request)

    if request.method == "PATCH":
        editable_fields = {
            "notes": "notes",
            "activity_category": "activity_category",
            "activity_kind": "activity_kind",
            "supplier": "supplier",
            "vendor": "vendor",
            "commodity": "commodity",
            "location": "location",
            "origin": "origin",
            "destination": "destination",
            "quantity": "quantity",
            "quantity_unit": "quantity_unit",
            "normalized_quantity": "normalized_quantity",
            "normalized_unit": "normalized_unit",
            "amount": "amount",
            "currency": "currency",
            "emission_factor": "emission_factor",
            "emissions_kg_co2e": "emissions_kg_co2e",
        }
        changed = False
        for incoming, field_name in editable_fields.items():
            if incoming not in payload:
                continue
            value = payload[incoming]
            if field_name in {"quantity", "normalized_quantity", "amount", "emission_factor", "emissions_kg_co2e"}:
                value = None if value in ("", None) else Decimal(str(value))
            setattr(record, field_name, value)
            changed = True
        if changed:
            record.review_status = NormalizedRecord.ReviewStatus.NEEDS_REVIEW
            record.validation_status = NormalizedRecord.ValidationStatus.WARNING
            record.edited_by = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
            record.edited_at = timezone.now()
            record.save()
            AuditEvent.objects.create(
                record=record,
                actor_name=actor_name,
                action=AuditEvent.Action.EDITED,
                before_state=before,
                after_state=record_to_dict(record),
            )
        return json_response({"record": record_to_dict(record)})

    action = payload.get("action")
    if action == "approve":
        record.review_status = NormalizedRecord.ReviewStatus.APPROVED
        record.is_locked = True
        record.locked_at = timezone.now()
        record.approved_at = timezone.now()
        record.approved_by = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
        record.save()
        AuditEvent.objects.create(
            record=record,
            actor_name=actor_name,
            action=AuditEvent.Action.APPROVED,
            before_state=before,
            after_state=record_to_dict(record),
        )
        return json_response({"record": record_to_dict(record)})
    if action == "reject":
        record.review_status = NormalizedRecord.ReviewStatus.REJECTED
        record.save()
        AuditEvent.objects.create(
            record=record,
            actor_name=actor_name,
            action=AuditEvent.Action.REJECTED,
            before_state=before,
            after_state=record_to_dict(record),
        )
        return json_response({"record": record_to_dict(record)})

    return json_response({"error": "Unsupported action."}, status=400)


def serialize_audit(event: AuditEvent) -> dict:
    return {
        "id": event.id,
        "actor_name": event.actor_name,
        "action": event.action,
        "before_state": event.before_state,
        "after_state": event.after_state,
        "created_at": event.created_at.isoformat(),
    }


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        return {}


def _json_field(request, key: str):
    body = _json_body(request)
    return body.get(key)


def default_source_system(source_type: str) -> str:
    if source_type == IngestionBatch.SourceType.SAP:
        return "SAP Ariba export"
    if source_type == IngestionBatch.SourceType.UTILITY:
        return "Utility portal CSV"
    return "Concur receipts API"
