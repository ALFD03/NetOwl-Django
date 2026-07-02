from django.shortcuts import render, redirect, get_object_or_404
from django.conf import settings
from django.contrib.auth import login as auth_login
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from django.contrib import messages
from .models import Profile

LOGIN_URL = settings.LOGIN_URL


def admin_required(view_func):
    return user_passes_test(lambda u: u.is_staff, login_url=LOGIN_URL)(view_func)


def login_view(request):
    if request.user.is_authenticated:
        return redirect("subscriptions:dashboard")
    if not User.objects.exists():
        return redirect("setup")
    form = AuthenticationForm(request, data=request.POST or None)
    if request.method == "POST" and form.is_valid():
        auth_login(request, form.get_user())
        return redirect(request.GET.get("next", "subscriptions:dashboard"))
    return render(request, "config/login.html", {"form": form})


def setup_view(request):
    if User.objects.exists():
        return redirect("login")
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")
        password2 = request.POST.get("password2", "")
        if not username or not password:
            messages.error(request, "Usuario y contraseña son obligatorios.")
        elif password != password2:
            messages.error(request, "Las contraseñas no coinciden.")
        elif len(password) < 8:
            messages.error(request, "La contraseña debe tener al menos 8 caracteres.")
        else:
            user = User.objects.create_superuser(username=username, email=email, password=password)
            Profile.objects.filter(user=user).update(role="admin")
            auth_login(request, user)
            messages.success(request, f"Administrador {username} creado. ¡Bienvenido!")
            return redirect("subscriptions:dashboard")
    return render(request, "config/setup.html")


@login_required(login_url=LOGIN_URL)
@admin_required
def user_list(request):
    users = User.objects.select_related("profile").all().order_by("username")
    return render(request, "config/user_list.html", {"users": users, "section": "users"})


@login_required(login_url=LOGIN_URL)
@admin_required
def user_create(request):
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")
        role = request.POST.get("role", "analyst")
        if not username or not password:
            messages.error(request, "Usuario y contraseña son obligatorios.")
        elif len(password) < 8:
            messages.error(request, "La contraseña debe tener al menos 8 caracteres.")
        elif User.objects.filter(username=username).exists():
            messages.error(request, "El nombre de usuario ya existe.")
        else:
            is_staff = role == "admin"
            user = User.objects.create_user(username=username, email=email, password=password, is_staff=is_staff)
            Profile.objects.update_or_create(user=user, defaults={"role": role})
            messages.success(request, f"Usuario {username} creado.")
            return redirect("config:user_list")
    return render(request, "config/user_form.html", {"editing": False, "section": "users"})


@login_required(login_url=LOGIN_URL)
@admin_required
def user_edit(request, user_id):
    user = get_object_or_404(User.objects.select_related("profile"), pk=user_id)
    profile = getattr(user, "profile", None)
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        email = request.POST.get("email", "").strip()
        role = request.POST.get("role", profile.role if profile else "analyst")
        password = request.POST.get("password", "")
        if not username:
            messages.error(request, "El nombre de usuario es obligatorio.")
        elif username != user.username and User.objects.filter(username=username).exists():
            messages.error(request, "El nombre de usuario ya existe.")
        else:
            user.username = username
            user.email = email
            user.is_staff = role == "admin"
            if password:
                user.set_password(password)
            user.save()
            Profile.objects.update_or_create(user=user, defaults={"role": role})
            messages.success(request, f"Usuario {username} actualizado.")
            return redirect("config:user_list")
    return render(request, "config/user_form.html", {"editing": True, "edit_user": user, "profile": profile, "section": "users"})


@login_required(login_url=LOGIN_URL)
@admin_required
def user_delete(request, user_id):
    user = get_object_or_404(User, pk=user_id)
    if user == request.user:
        messages.error(request, "No puedes eliminarte a ti mismo.")
        return redirect("config:user_list")
    if request.method == "POST":
        username = user.username
        user.delete()
        messages.success(request, f"Usuario {username} eliminado.")
        return redirect("config:user_list")
    return render(request, "config/user_confirm_delete.html", {"delete_user": user, "section": "users"})
