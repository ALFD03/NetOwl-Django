"""Páginas de `/encuestas/`."""

from django.urls import path

from services.config.pages import module_root, page

app_name = "encuestas"

PAGES = [
    ("encuestas:instalados", ("can_view_surveys",)),
    ("encuestas:bajas", ("can_view_surveys",)),
    ("encuestas:configuracion", ("can_manage_surveys",)),
]

urlpatterns = [
    path("", module_root(PAGES), name="index"),
    path("instalados/", page("can_view_surveys"), name="instalados"),
    path("bajas/", page("can_view_surveys"), name="bajas"),
    path("configuracion/", page("can_manage_surveys"), name="configuracion"),
]
