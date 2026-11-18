"""Páginas de `/auth/`. El primer administrador se crea con `manage.py create_admin`."""

from django.urls import path

from .pages import login_page, page

app_name = "config"

urlpatterns = [
    path("login/", login_page, name="login"),
    path("users/", page("can_view_users"), name="user_management"),
    path("tokens/", page("can_manage_api_tokens"), name="tokens"),
]
