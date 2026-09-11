"""Rutas de autenticacion y administracion de usuarios, bajo `/auth/`."""

# --- START OF FILE NetOwl-Django/frontend/config/urls.py ---
from django.urls import path

from . import views

app_name = "config"

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("setup/", views.setup_view, name="setup"),
    path("users/", views.user_management_view, name="user_management"),
    
    # APIS DE GESTIÓN DE USUARIOS Y PERMISOS INDIVIDUALES
    path("api/users/create/", views.api_create_user, name="api_create_user"),
    path("api/users/update-role/", views.api_update_user_role, name="api_update_user_role"),
    path("api/users/update-permissions/", views.api_update_user_permissions, name="api_update_user_permissions"),
    path("api/users/delete/", views.api_delete_user, name="api_delete_user"),
    path("api/users/change-password/", views.api_admin_change_password, name="api_admin_change_password"),

    # APIS DE GESTIÓN DE GRUPOS DE PERMISOS
    path("api/groups/save/", views.api_save_permission_group, name="api_save_permission_group"),
    path("api/groups/delete/", views.api_delete_permission_group, name="api_delete_permission_group"),
    path("api/users/assign-group/", views.api_assign_user_group, name="api_assign_user_group"),
]
# --- END OF FILE NetOwl-Django/frontend/config/urls.py ---