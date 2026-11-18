"""Páginas de `/comisiones/`."""

from django.urls import path

from services.config.pages import page

app_name = "comisiones"

urlpatterns = [
    path("", page("can_view_commissions"), name="informe"),
    path("condiciones/", page("can_manage_commissions"), name="condiciones"),
]
