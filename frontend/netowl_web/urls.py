"""Enrutamiento principal del proyecto netowl_web."""
from django.urls import include, path
from django.shortcuts import redirect
from django.contrib.auth import views as auth_views

from frontend.config import views as config_views

urlpatterns = [
    path("", lambda r: redirect("subscriptions:dashboard")),
    path("login/", config_views.login_view, name="login"),
    path("setup/", config_views.setup_view, name="setup"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("config/", include("frontend.config.urls")),
    path("subscriptions/", include("frontend.subscriptions.urls")),
    path("crm/", include("frontend.crm.urls")),
]
