from __future__ import annotations

import csv
import hashlib
import io
import json
import math
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from django.utils import timezone

from .models import IngestionBatch, NormalizedRecord


AIRPORT_COORDS = {
    "JFK": (40.6413, -73.7781),
    "LGA": (40.7769, -73.8740),
    "EWR": (40.6895, -74.1745),
    "SFO": (37.6213, -122.3790),
    "LAX": (33.9416, -118.4085),
    "DEL": (28.5562, 77.1000),
    "BOM": (19.0896, 72.8656),
    "BLR": (13.1986, 77.7066),
    "HYD": (17.2403, 78.4294),
    "SIN": (1.3644, 103.9915),
    "LHR": (51.4700, -0.4543),
}

DEFAULT_FACTORS = {
    "air": Decimal("0.158"),
    "hotel": Decimal("15.0"),
    "ground": Decimal("0.180"),
    "electricity": Decimal("0.370"),
}


@dataclass
class NormalizationResult:
    normalized: dict[str, Any]
    warnings: list[str]
    failed: bool = False


def parse_uploaded_rows(source_type: str, raw_text: str) -> list[dict[str, Any]]:
    if source_type == IngestionBatch.SourceType.TRAVEL:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            if "records" in data and isinstance(data["records"], list):
                return data["records"]
            if "data" in data and isinstance(data["data"], list):
                return data["data"]
            return [data]
        return list(data)
    reader = csv.DictReader(io.StringIO(raw_text))
    return [dict(row) for row in reader]


def fingerprint_record(payload: dict[str, Any], row_number: int) -> str:
    digest = hashlib.sha256()
    digest.update(str(row_number).encode("utf-8"))
    digest.update(json.dumps(payload, sort_keys=True, default=str).encode("utf-8"))
    return digest.hexdigest()


def parse_decimal(value: Any) -> Decimal | None:
    if value in (None, "", "null"):
        return None
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, AttributeError):
        return None


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    value = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    value = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(value, fmt)
            return timezone.make_aware(dt) if timezone.is_naive(dt) else dt
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return timezone.make_aware(dt) if timezone.is_naive(dt) else dt
    except ValueError:
        return None


def normalize_uploaded_row(
    tenant_slug: str,
    batch: IngestionBatch,
    row: dict[str, Any],
    row_number: int,
) -> NormalizationResult:
    source_type = batch.source_type
    if source_type == IngestionBatch.SourceType.SAP:
        return normalize_sap_row(batch, row, row_number)
    if source_type == IngestionBatch.SourceType.UTILITY:
        return normalize_utility_row(batch, row, row_number)
    return normalize_travel_row(batch, row, row_number)


def normalize_sap_row(batch: IngestionBatch, row: dict[str, Any], row_number: int) -> NormalizationResult:
    warnings: list[str] = []
    document_type = str(row.get("document_type") or row.get("doc_type") or row.get("belegart") or "").strip()
    commodity = str(row.get("commodity") or row.get("material_description") or row.get("description") or "").strip()
    unit = str(row.get("unit") or row.get("menge_einheit") or row.get("uom") or "").strip().lower()
    quantity = parse_decimal(row.get("quantity") or row.get("menge"))
    amount = parse_decimal(row.get("amount") or row.get("net_amount") or row.get("wert"))
    emission_factor = parse_decimal(row.get("emission_factor") or row.get("factor"))
    activity_date = parse_date(row.get("posting_date") or row.get("bldat") or row.get("date"))
    source_subtype = "fuel" if any(token in f"{document_type} {commodity}".lower() for token in ("fuel", "diesel", "petrol", "gasoline", "gas")) else "procurement"
    scope_category = NormalizedRecord.ScopeCategory.SCOPE1 if source_subtype == "fuel" else NormalizedRecord.ScopeCategory.SCOPE3
    normalized_unit = unit or ""
    normalized_quantity = quantity

    if unit in {"gal", "gallon", "gallons"} and quantity is not None:
        normalized_unit = "liter"
        normalized_quantity = (quantity * Decimal("3.78541")).quantize(Decimal("0.0001"))
        warnings.append("Converted gallons to liters for normalization.")
    elif unit in {"l", "liter", "litre", "liters", "litres"} and quantity is not None:
        normalized_unit = "liter"
    elif not unit:
        warnings.append("Missing unit in SAP row.")

    if source_subtype == "procurement" and not amount:
        warnings.append("Procurement row has no amount; spend-based emissions may be incomplete.")

    emissions = None
    if quantity is not None and emission_factor is not None:
        emissions = (normalized_quantity or quantity) * emission_factor

    if not activity_date:
        warnings.append("Missing or unparseable posting date.")
    if not commodity:
        warnings.append("Missing commodity description.")

    normalized = {
        "source_subtype": source_subtype,
        "source_system": batch.source_system,
        "source_recorded_at": parse_datetime(row.get("created_at") or row.get("changed_at")),
        "external_id": str(row.get("document_id") or row.get("po_number") or row.get("invoice_id") or "").strip(),
        "source_document_id": str(row.get("document_id") or row.get("sap_doc") or "").strip(),
        "activity_category": "Fuel" if source_subtype == "fuel" else "Procurement",
        "activity_kind": commodity or document_type or "SAP row",
        "activity_date": activity_date,
        "supplier": str(row.get("supplier") or row.get("vendor") or row.get("lieferant") or "").strip(),
        "location": str(row.get("plant_code") or row.get("werks") or row.get("site") or "").strip(),
        "commodity": commodity,
        "quantity": quantity,
        "quantity_unit": unit,
        "normalized_quantity": normalized_quantity,
        "normalized_unit": normalized_unit,
        "amount": amount,
        "currency": str(row.get("currency") or row.get("waers") or "INR").strip(),
        "emission_factor": emission_factor,
        "emissions_kg_co2e": emissions,
        "scope_category": scope_category,
        "confidence_score": Decimal("0.78") if source_subtype == "fuel" else Decimal("0.65"),
        "validation_status": NormalizedRecord.ValidationStatus.VALID if not warnings else NormalizedRecord.ValidationStatus.WARNING,
    }
    return NormalizationResult(normalized=normalized, warnings=warnings, failed=False)


def normalize_utility_row(batch: IngestionBatch, row: dict[str, Any], row_number: int) -> NormalizationResult:
    warnings: list[str] = []
    billing_start = parse_date(row.get("billing_start") or row.get("period_start") or row.get("from"))
    billing_end = parse_date(row.get("billing_end") or row.get("period_end") or row.get("to"))
    usage_kwh = parse_decimal(row.get("usage_kwh") or row.get("kwh") or row.get("usage"))
    amount = parse_decimal(row.get("total_amount") or row.get("bill_total") or row.get("amount"))
    emission_factor = parse_decimal(row.get("grid_factor_kg_per_kwh") or row.get("emission_factor")) or DEFAULT_FACTORS["electricity"]
    emissions = (usage_kwh * emission_factor) if usage_kwh is not None else None
    if billing_start and billing_end and (billing_end - billing_start).days > 40:
        warnings.append("Billing period is longer than 40 days, which is unusual.")
    if usage_kwh is None:
        warnings.append("Missing kWh usage.")
    if amount is None:
        warnings.append("Missing total bill amount.")
    if not billing_end:
        warnings.append("Missing billing period end date.")

    normalized = {
        "source_subtype": "electricity",
        "source_system": batch.source_system,
        "source_recorded_at": parse_datetime(row.get("read_at") or row.get("generated_at")),
        "external_id": str(row.get("invoice_id") or row.get("statement_id") or "").strip(),
        "source_document_id": str(row.get("bill_number") or row.get("statement_id") or "").strip(),
        "activity_category": "Electricity",
        "activity_kind": str(row.get("tariff_code") or row.get("meter_id") or "metered electricity").strip(),
        "activity_date": billing_end,
        "period_start": billing_start,
        "period_end": billing_end,
        "location": str(row.get("site_name") or row.get("premise") or row.get("address") or "").strip(),
        "supplier": str(row.get("utility_provider") or row.get("provider") or "").strip(),
        "commodity": "electricity",
        "quantity": usage_kwh,
        "quantity_unit": "kWh",
        "normalized_quantity": usage_kwh,
        "normalized_unit": "kWh",
        "amount": amount,
        "currency": str(row.get("currency") or "INR").strip(),
        "emission_factor": emission_factor,
        "emissions_kg_co2e": emissions,
        "scope_category": NormalizedRecord.ScopeCategory.SCOPE2,
        "confidence_score": Decimal("0.83"),
        "validation_status": NormalizedRecord.ValidationStatus.VALID if not warnings else NormalizedRecord.ValidationStatus.WARNING,
    }
    return NormalizationResult(normalized=normalized, warnings=warnings, failed=False)


def normalize_travel_row(batch: IngestionBatch, row: dict[str, Any], row_number: int) -> NormalizationResult:
    warnings: list[str] = []
    travel_type = str(row.get("type") or row.get("travel_type") or row.get("receipt_type") or "").strip().lower()
    amount = parse_decimal(row.get("amount") or row.get("total_amount"))
    currency = str(row.get("currency") or "INR").strip()
    origin = str(row.get("origin_airport") or row.get("origin") or row.get("from_airport") or "").strip().upper()
    destination = str(row.get("destination_airport") or row.get("destination") or row.get("to_airport") or "").strip().upper()
    source_recorded_at = parse_datetime(row.get("booked_at") or row.get("received_at") or row.get("submitted_at"))
    activity_date = parse_date(row.get("travel_date") or row.get("date") or row.get("start_date") or row.get("check_in"))
    start_date = parse_date(row.get("start_date") or row.get("check_in"))
    end_date = parse_date(row.get("end_date") or row.get("check_out"))
    distance = parse_decimal(row.get("distance_km") or row.get("distance") or row.get("miles"))
    distance_unit = str(row.get("distance_unit") or row.get("distance_measure") or "").strip().lower()
    quantity = None
    normalized_unit = ""
    emission_factor = None
    activity_category = "Travel"
    source_subtype = travel_type or "trip"

    if travel_type == "air":
        if distance is None and origin and destination:
            estimated_km = estimate_air_distance_km(origin, destination)
            if estimated_km is not None:
                distance = Decimal(str(round(estimated_km, 2)))
                warnings.append("Distance was estimated from airport codes.")
        if distance is not None and distance_unit in {"mi", "mile", "miles"}:
            distance = (distance * Decimal("1.60934")).quantize(Decimal("0.0001"))
        quantity = distance
        normalized_unit = "passenger-km"
        emission_factor = parse_decimal(row.get("emission_factor")) or DEFAULT_FACTORS["air"]
    elif travel_type == "hotel":
        quantity = parse_decimal(row.get("nights") or row.get("rooms") or 1)
        normalized_unit = "room-night"
        emission_factor = parse_decimal(row.get("emission_factor")) or DEFAULT_FACTORS["hotel"]
    else:
        quantity = distance or parse_decimal(row.get("rides") or 1)
        if distance_unit in {"mi", "mile", "miles"} and quantity is not None:
            quantity = (quantity * Decimal("1.60934")).quantize(Decimal("0.0001"))
        normalized_unit = "ride-km" if travel_type in {"ground", "car", "taxi"} else "trip"
        emission_factor = parse_decimal(row.get("emission_factor")) or DEFAULT_FACTORS["ground"]

    emissions = (quantity * emission_factor) if quantity is not None and emission_factor is not None else None
    if not travel_type:
        warnings.append("Travel row is missing a category; defaulted to generic trip.")
    if amount is None:
        warnings.append("Travel booking has no amount.")
    if travel_type == "air" and not (origin and destination):
        warnings.append("Air travel row missing airport codes.")
    if travel_type == "hotel" and start_date and end_date and end_date < start_date:
        warnings.append("Hotel checkout precedes check-in.")

    normalized = {
        "source_subtype": travel_type or "trip",
        "source_system": batch.source_system,
        "source_recorded_at": source_recorded_at,
        "external_id": str(row.get("booking_id") or row.get("receipt_id") or row.get("trip_id") or "").strip(),
        "source_document_id": str(row.get("receipt_id") or row.get("booking_id") or "").strip(),
        "activity_category": activity_category,
        "activity_kind": travel_type or "travel",
        "activity_date": activity_date or start_date,
        "period_start": start_date,
        "period_end": end_date,
        "origin": origin,
        "destination": destination,
        "supplier": str(row.get("supplier") or row.get("carrier") or row.get("hotel") or "").strip(),
        "commodity": str(row.get("class") or row.get("fare_class") or row.get("room_type") or "").strip(),
        "quantity": quantity,
        "quantity_unit": "mi" if distance_unit in {"mi", "mile", "miles"} else distance_unit or "",
        "normalized_quantity": quantity,
        "normalized_unit": normalized_unit,
        "amount": amount,
        "currency": currency,
        "emission_factor": emission_factor,
        "emissions_kg_co2e": emissions,
        "scope_category": NormalizedRecord.ScopeCategory.SCOPE3,
        "location": str(row.get("route") or row.get("city") or "").strip(),
        "confidence_score": Decimal("0.87") if travel_type in {"air", "hotel"} else Decimal("0.74"),
        "validation_status": NormalizedRecord.ValidationStatus.VALID if not warnings else NormalizedRecord.ValidationStatus.WARNING,
    }
    return NormalizationResult(normalized=normalized, warnings=warnings, failed=False)


def estimate_air_distance_km(origin: str, destination: str) -> float | None:
    if origin not in AIRPORT_COORDS or destination not in AIRPORT_COORDS:
        return None
    lat1, lon1 = AIRPORT_COORDS[origin]
    lat2, lon2 = AIRPORT_COORDS[destination]
    return haversine_km(lat1, lon1, lat2, lon2)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def record_to_dict(record: NormalizedRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "tenant": record.tenant.slug,
        "batch_id": record.batch_id,
        "source_type": record.source_type,
        "source_subtype": record.source_subtype,
        "source_system": record.source_system,
        "source_recorded_at": record.source_recorded_at.isoformat() if record.source_recorded_at else None,
        "source_received_at": record.source_received_at.isoformat() if record.source_received_at else None,
        "source_row_number": record.source_row_number,
        "external_id": record.external_id,
        "source_document_id": record.source_document_id,
        "scope_category": record.scope_category,
        "activity_category": record.activity_category,
        "activity_kind": record.activity_kind,
        "activity_date": record.activity_date.isoformat() if record.activity_date else None,
        "period_start": record.period_start.isoformat() if record.period_start else None,
        "period_end": record.period_end.isoformat() if record.period_end else None,
        "location": record.location,
        "origin": record.origin,
        "destination": record.destination,
        "supplier": record.supplier,
        "vendor": record.vendor,
        "commodity": record.commodity,
        "quantity": str(record.quantity) if record.quantity is not None else None,
        "quantity_unit": record.quantity_unit,
        "normalized_quantity": str(record.normalized_quantity) if record.normalized_quantity is not None else None,
        "normalized_unit": record.normalized_unit,
        "amount": str(record.amount) if record.amount is not None else None,
        "currency": record.currency,
        "emission_factor": str(record.emission_factor) if record.emission_factor is not None else None,
        "emissions_kg_co2e": str(record.emissions_kg_co2e) if record.emissions_kg_co2e is not None else None,
        "confidence_score": str(record.confidence_score),
        "suspicion_flags": record.suspicion_flags,
        "validation_status": record.validation_status,
        "review_status": record.review_status,
        "is_locked": record.is_locked,
        "locked_at": record.locked_at.isoformat() if record.locked_at else None,
        "approved_at": record.approved_at.isoformat() if record.approved_at else None,
        "approved_by": getattr(record.approved_by, "username", None),
        "edited_at": record.edited_at.isoformat() if record.edited_at else None,
        "edited_by": getattr(record.edited_by, "username", None),
        "raw_payload": record.raw_payload,
        "normalized_payload": record.normalized_payload,
        "notes": record.notes,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
    }


def batch_to_dict(batch: IngestionBatch) -> dict[str, Any]:
    return {
        "id": batch.id,
        "tenant": batch.tenant.slug,
        "source_type": batch.source_type,
        "ingestion_mode": batch.ingestion_mode,
        "source_system": batch.source_system,
        "original_filename": batch.original_filename,
        "status": batch.status,
        "row_count": batch.row_count,
        "valid_count": batch.valid_count,
        "warning_count": batch.warning_count,
        "failed_count": batch.failed_count,
        "notes": batch.notes,
        "created_at": batch.created_at.isoformat(),
        "updated_at": batch.updated_at.isoformat(),
    }
