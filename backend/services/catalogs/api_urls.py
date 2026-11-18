"""Rutas de `/api/catalogs/`."""

from django.urls import path

from . import views

app_name = "catalogs"

urlpatterns = [
    path("notifications/", views.notifications, name="notifications"),
    path("products/", views.products, name="products"),
    path("structure/", views.structure, name="structure"),
    path("sales/", views.sales, name="sales"),
    path("save/", views.save, name="save"),
    path("save-batch/", views.save_batch, name="save_batch"),
    path("delete/", views.delete, name="delete"),
]
