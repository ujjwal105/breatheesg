from decimal import Decimal

from django.conf import settings
from django.db import models


class Tenant(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class IngestionBatch(models.Model):
    class SourceType(models.TextChoices):
        SAP = "sap", "SAP"
        UTILITY = "utility", "Utility"
        TRAVEL = "travel", "Travel"

    class IngestionMode(models.TextChoices):
        CSV = "csv", "CSV upload"
        JSON = "json", "JSON upload"

    class BatchStatus(models.TextChoices):
        RECEIVED = "received", "Received"
        PARSED = "parsed", "Parsed"
        PARTIAL = "partial", "Partially failed"
        FAILED = "failed", "Failed"
        READY = "ready", "Ready for review"
        APPROVED = "approved", "Approved"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="batches")
    source_type = models.CharField(max_length=20, choices=SourceType.choices)
    ingestion_mode = models.CharField(max_length=20, choices=IngestionMode.choices)
    source_system = models.CharField(max_length=120)
    original_filename = models.CharField(max_length=255, blank=True)
    raw_payload = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    row_count = models.PositiveIntegerField(default=0)
    valid_count = models.PositiveIntegerField(default=0)
    warning_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=BatchStatus.choices, default=BatchStatus.RECEIVED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.tenant.slug}:{self.source_type}:{self.created_at:%Y-%m-%d %H:%M}"


class NormalizedRecord(models.Model):
    class SourceType(models.TextChoices):
        SAP = "sap", "SAP"
        UTILITY = "utility", "Utility"
        TRAVEL = "travel", "Travel"

    class ScopeCategory(models.TextChoices):
        SCOPE1 = "scope_1", "Scope 1"
        SCOPE2 = "scope_2", "Scope 2"
        SCOPE3 = "scope_3", "Scope 3"

    class ReviewStatus(models.TextChoices):
        NEEDS_REVIEW = "needs_review", "Needs review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class ValidationStatus(models.TextChoices):
        VALID = "valid", "Valid"
        WARNING = "warning", "Warning"
        FAILED = "failed", "Failed"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="records")
    batch = models.ForeignKey(IngestionBatch, on_delete=models.CASCADE, related_name="records")
    source_type = models.CharField(max_length=20, choices=SourceType.choices)
    source_subtype = models.CharField(max_length=40, blank=True)
    source_system = models.CharField(max_length=120)
    external_id = models.CharField(max_length=120, blank=True)
    source_document_id = models.CharField(max_length=120, blank=True)
    source_recorded_at = models.DateTimeField(null=True, blank=True)
    source_received_at = models.DateTimeField(auto_now_add=True)
    source_row_number = models.PositiveIntegerField(default=0)
    source_fingerprint = models.CharField(max_length=128, blank=True)
    raw_payload = models.JSONField(default=dict)
    normalized_payload = models.JSONField(default=dict)
    scope_category = models.CharField(max_length=20, choices=ScopeCategory.choices)
    activity_category = models.CharField(max_length=80)
    activity_kind = models.CharField(max_length=80, blank=True)
    activity_date = models.DateField(null=True, blank=True)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=160, blank=True)
    origin = models.CharField(max_length=80, blank=True)
    destination = models.CharField(max_length=80, blank=True)
    supplier = models.CharField(max_length=160, blank=True)
    vendor = models.CharField(max_length=160, blank=True)
    commodity = models.CharField(max_length=120, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    quantity_unit = models.CharField(max_length=40, blank=True)
    normalized_quantity = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    normalized_unit = models.CharField(max_length=40, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=12, blank=True)
    emission_factor = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    emissions_kg_co2e = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    confidence_score = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal("0.70"))
    suspicion_flags = models.JSONField(default=list)
    validation_status = models.CharField(
        max_length=20,
        choices=ValidationStatus.choices,
        default=ValidationStatus.WARNING,
    )
    review_status = models.CharField(
        max_length=20,
        choices=ReviewStatus.choices,
        default=ReviewStatus.NEEDS_REVIEW,
    )
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_records",
    )
    edited_at = models.DateTimeField(null=True, blank=True)
    edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_records",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tenant", "review_status"]),
            models.Index(fields=["tenant", "source_type"]),
            models.Index(fields=["tenant", "scope_category"]),
        ]

    def __str__(self) -> str:
        return f"{self.activity_category} {self.quantity or ''} {self.quantity_unit}".strip()


class AuditEvent(models.Model):
    class Action(models.TextChoices):
        CREATED = "created", "Created"
        IMPORTED = "imported", "Imported"
        EDITED = "edited", "Edited"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        LOCKED = "locked", "Locked"

    record = models.ForeignKey(NormalizedRecord, on_delete=models.CASCADE, related_name="audit_events")
    actor_name = models.CharField(max_length=120, blank=True)
    action = models.CharField(max_length=20, choices=Action.choices)
    before_state = models.JSONField(default=dict)
    after_state = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.action} for record {self.record_id}"
