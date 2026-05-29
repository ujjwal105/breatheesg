from django.contrib import admin

from .models import AuditEvent, IngestionBatch, NormalizedRecord, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("slug", "name", "created_at")
    search_fields = ("slug", "name")


@admin.register(IngestionBatch)
class IngestionBatchAdmin(admin.ModelAdmin):
    list_display = ("tenant", "source_type", "status", "row_count", "valid_count", "warning_count", "failed_count", "created_at")
    list_filter = ("source_type", "status")
    search_fields = ("tenant__slug", "source_system", "original_filename")


@admin.register(NormalizedRecord)
class NormalizedRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "source_type", "scope_category", "activity_category", "review_status", "validation_status", "created_at")
    list_filter = ("source_type", "scope_category", "review_status", "validation_status")
    search_fields = ("tenant__slug", "activity_category", "supplier", "origin", "destination", "commodity")


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("id", "record", "action", "actor_name", "created_at")
    list_filter = ("action",)
    search_fields = ("record__id", "actor_name")
