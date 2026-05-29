from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("overview/", views.overview),
    path("batches/", views.batches),
    path("records/", views.records),
    path("records/<int:record_id>/", views.record_action),
    path("records/<int:record_id>/detail/", views.record_detail),
    path("imports/", views.import_records),
]
