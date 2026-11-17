"""Rutas de `/api/auth/`."""

from django.urls import path

from . import views

app_name = "auth"

urlpatterns = [
    path("login/", views.login, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.me, name="me"),
    path("tokens/", views.tokens, name="tokens"),
    path("tokens/<int:token_id>/revoke/", views.revoke_token, name="revoke_token"),
]
