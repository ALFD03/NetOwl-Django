"""Enrutamiento principal del proyecto netowl_web."""
from django.urls import include, path
from django.shortcuts import redirect

urlpatterns = [
    path("", lambda r: redirect("subscriptions:dashboard")),
    path("subscriptions/", include("frontend.subscriptions.urls")),
    path("crm/", include("frontend.crm.urls")),
]
