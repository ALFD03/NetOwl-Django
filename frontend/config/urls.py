# frontend/config/urls.py
from django.urls import path
from . import views

app_name = "config"

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("setup/", views.setup_view, name="setup"),
    path("users/", views.user_management_view, name="user_management"),
    path("api/users/create/", views.api_create_user, name="api_create_user"),
    path("api/users/update-role/", views.api_update_user_role, name="api_update_user_role"),
    path("api/users/delete/", views.api_delete_user, name="api_delete_user"),
    path("api/users/change-password/", views.api_admin_change_password, name="api_admin_change_password"),
]