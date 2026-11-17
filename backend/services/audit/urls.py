"""Páginas de `/auditoria/`."""

from django.urls import path

from services.config.pages import page

app_name = "auditoria"

urlpatterns = [
    path("", page("can_view_auditoria"), name="registro"),
    path("monitoreo/", page("can_view_auditoria"), name="monitoreo"),
]
