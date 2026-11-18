"""Páginas de `/catalogos/`."""

from django.shortcuts import redirect
from django.urls import path

from services.config.pages import page

app_name = "catalogos"

ANY_CATALOG = ("can_manage_operational_catalog", "can_manage_commercial_catalog", "can_manage_sales_catalog")

urlpatterns = [
    path("", lambda request: redirect("catalogos:notificaciones"), name="inicio"),
    path("notificaciones/", page(*ANY_CATALOG, require_all=False), name="notificaciones"),
    path("productos/", page("can_manage_operational_catalog"), name="productos"),
    path("estructura/", page("can_manage_commercial_catalog"), name="estructura"),
    path("ventas/", page("can_manage_sales_catalog"), name="ventas"),
]
