"""Páginas de `/auditoria/`."""

from django.urls import path

from services.config.pages import page

app_name = "auditoria"

urlpatterns = [
    path("", page("can_view_audit"), name="registro"),
    path("monitoreo/", page("can_view_audit"), name="monitoreo"),
]
