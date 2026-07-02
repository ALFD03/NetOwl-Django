import os
import tempfile
from functools import wraps

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.contrib import messages


def analyst_or_admin_required(view_func):
    @wraps(view_func)
    def _wrapper(request, *args, **kwargs):
        if request.user.is_staff:
            return view_func(request, *args, **kwargs)
        profile = getattr(request.user, "profile", None)
        if profile and profile.role in ("admin", "analyst"):
            return view_func(request, *args, **kwargs)
        if request.headers.get("accept") == "application/json" or request.path.startswith("/api/"):
            return JsonResponse({"status": "error", "message": "No tienes permiso para realizar esta acción."}, status=403)
        messages.error(request, "No tienes permiso para acceder a esta sección.")
        return redirect("/subscriptions/dashboard/")
    return _wrapper


def handle_csv_upload(request):
    if "csv_file" not in request.FILES:
        return None, JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
    csv_file = request.FILES["csv_file"]
    if not csv_file.name.endswith(".csv"):
        return None, JsonResponse({"status": "error", "message": "Solo archivos .csv"}, status=400)
    if csv_file.size > settings.FILE_UPLOAD_MAX_MEMORY_SIZE:
        return None, JsonResponse({"status": "error", "message": "Archivo muy grande"}, status=400)
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        for chunk in csv_file.chunks():
            tmp.write(chunk)
        tmp_path = tmp.name
        tmp.close()
    except Exception as e:
        return None, JsonResponse({"status": "error", "message": str(e)}, status=500)
    return tmp_path, None


def cleanup_tempfile(tmp_path):
    if tmp_path:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
