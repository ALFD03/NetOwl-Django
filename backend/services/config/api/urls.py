"""Rutas de `/api/auth/`."""

from django.urls import path

from . import users, views

app_name = "auth"

urlpatterns = [
    path("login/", views.login, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.me, name="me"),
    path("tokens/", views.tokens, name="tokens"),
    path("tokens/<int:token_id>/revoke/", views.revoke_token, name="revoke_token"),
    path("users/", users.users, name="users"),
    path("users/<int:user_id>/", users.user_detail, name="user_detail"),
    path("users/<int:user_id>/permissions/", users.user_permissions, name="user_permissions"),
    path("users/<int:user_id>/password/", users.user_password, name="user_password"),
    path("groups/", users.groups, name="groups"),
    path("groups/<int:group_id>/", users.group_detail, name="group_detail"),
]
