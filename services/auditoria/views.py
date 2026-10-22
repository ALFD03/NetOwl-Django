"""La pantalla del registro de auditoria, bajo `/auditoria/`.

Los filtros (fechas, modulo, usuario, resultado, texto) se aplican en el
servidor: la tabla crece sin limite y no se puede mandar entera. De lo que
queda se envian los `LIMITE` mas recientes; la busqueda, el orden y la
paginacion dentro de ellos son del cliente, como en cualquier `DataTable`. El
`detalle` de cada registro no viaja en la lista: se pide al abrirlo.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from inertia import render as render_inertia

from services.config.decorators import permission_required

from .models import RegistroAuditoria

LIMITE = 1000

# Nombres legibles de los modulos (el `app_name` de cada ruta).
MODULOS = {
    "config": "Usuarios y acceso",
    "imports": "Importaciones",
    "subscriptions": "Suscripciones",
    "crm": "CRM",
    "support": "Soporte técnico",
    "catalogos": "Catálogos",
    "comisiones": "Comisiones",
    "auditoria": "Auditoría",
    "analisis": "Análisis (worker)",
}

# Nombres legibles de las acciones. Lo que no esta aqui se muestra por su
# nombre de ruta: un endpoint nuevo queda auditado aunque nadie lo traduzca.
ACCIONES = {
    "login": "Inicio de sesión",
    "logout": "Cierre de sesión",
    "login_fallido": "Credenciales incorrectas",
    "login_bloqueado": "Acceso bloqueado por intentos",
    "api_create_user": "Crear usuario",
    "api_update_user_permissions": "Editar permisos de usuario",
    "api_update_user_role": "Cambiar rol de usuario",
    "api_assign_user_group": "Asignar grupo a usuario",
    "api_admin_change_password": "Cambiar contraseña",
    "api_delete_user": "Eliminar usuario",
    "api_save_permission_group": "Guardar grupo de permisos",
    "api_delete_permission_group": "Eliminar grupo de permisos",
    "api_import_subscriptions": "Importar suscripciones",
    "api_import_logs": "Importar logs",
    "api_import_gratis": "Importar planes gratuitos",
    "api_import_facturas": "Importar facturas",
    "api_import_crm": "Importar CRM",
    "api_import_support": "Importar soporte",
    "api_run_analysis": "Lanzar análisis de churn",
    "api_run_crm_analysis": "Lanzar análisis de CRM",
    "api_run_support_analysis": "Lanzar análisis de soporte",
    "api_lifecycle_run": "Lanzar ciclo de vida",
    "api_job_cancel": "Cancelar análisis",
    "analisis_terminado": "Análisis terminado",
    "analisis_fallido": "Análisis fallido",
    "analisis_cancelado": "Análisis cancelado",
    "api_guardar": "Guardar en catálogo",
    "api_guardar_lote": "Guardar en catálogo (lote)",
    "api_eliminar": "Eliminar de catálogo",
    "api_periodo_guardar": "Guardar periodo de comisiones",
    "api_periodo_cerrar": "Cerrar periodo de comisiones",
    "api_periodo_reabrir": "Reabrir periodo de comisiones",
    "api_revision_guardar": "Decidir revisión de comisiones",
    "api_manual_agregar": "Agregar venta manual",
    "api_manual_quitar": "Quitar venta manual",
    "api_indicador_guardar": "Guardar indicador de comisiones",
    "api_cumplimiento_general": "Guardar cumplimiento general",
    "api_supervisores_unidad": "Asignar supervisores a UN",
    "api_condiciones_guardar": "Guardar condiciones de pago",
    "api_ventas": "Consultar detalle de ventas",
    "api_lifetime_detalle": "Exportar detalle de ciclo de vida",
    "api_bajas_detalle": "Exportar detalle de bajas",
    "api_eta_report_lock": "Bloquear reporte ETA",
    "api_eta_report_tasa": "Guardar tasa del reporte ETA",
    "api_eta_report_save_sub_config": "Guardar excepción ETA",
    "api_eta_report_delete_sub_config": "Eliminar excepción ETA",
    "api_usuario_guardar": "Guardar usuario de soporte",
    "api_usuario_eliminar": "Eliminar usuario de soporte",
    "api_usuario_movimiento": "Mover usuario de soporte de departamento",
}


def etiqueta_accion(accion: str) -> str:
    return ACCIONES.get(accion) or accion.removeprefix("api_").replace("_", " ").capitalize()


def _fecha(valor: str | None) -> date | None:
    try:
        return date.fromisoformat(valor) if valor else None
    except ValueError:
        return None


def _filtrar(params) -> tuple:
    """El queryset filtrado y los filtros tal y como se aplicaron."""
    hoy = timezone.localdate()
    desde = _fecha(params.get("desde")) or hoy - timedelta(days=30)
    hasta = _fecha(params.get("hasta")) or hoy
    if hasta < desde:
        desde, hasta = hasta, desde
    zona = timezone.get_current_timezone()
    qs = RegistroAuditoria.objects.filter(
        fecha__gte=timezone.make_aware(datetime.combine(desde, time.min), zona),
        fecha__lt=timezone.make_aware(datetime.combine(hasta + timedelta(days=1), time.min), zona),
    )
    filtros = {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "modulo": "", "usuario": "", "resultado": "", "q": ""}

    if modulo := params.get("modulo"):
        qs = qs.filter(modulo=modulo)
        filtros["modulo"] = modulo
    if usuario := params.get("usuario"):
        qs = qs.filter(username=usuario)
        filtros["usuario"] = usuario
    if resultado := params.get("resultado"):
        qs = qs.filter(resultado=resultado)
        filtros["resultado"] = resultado
    if q := (params.get("q") or "").strip()[:100]:
        qs = qs.filter(
            Q(descripcion__icontains=q) | Q(objeto__icontains=q) | Q(accion__icontains=q) | Q(username__icontains=q)
        )
        filtros["q"] = q
    return qs, filtros


def _fila(r: RegistroAuditoria) -> dict:
    return {
        "id": r.id,
        "fecha": timezone.localtime(r.fecha).strftime("%Y-%m-%d %H:%M:%S"),
        "username": r.username or "—",
        "ip": r.ip or "",
        "modulo": r.modulo,
        "modulo_display": MODULOS.get(r.modulo, r.modulo),
        "accion": r.accion,
        "accion_display": etiqueta_accion(r.accion),
        "resultado": r.resultado,
        "resultado_display": r.get_resultado_display(),
        "estado_http": r.estado_http,
        "objeto": r.objeto,
        "descripcion": r.descripcion,
    }


@login_required
@permission_required("can_view_auditoria")
def registro_view(request):
    """El registro filtrado: los `LIMITE` mas recientes de lo que cumple los filtros."""
    qs, filtros = _filtrar(request.GET)
    total = qs.count()
    registros = [_fila(r) for r in qs.order_by("-fecha", "-id")[:LIMITE]]

    usuarios = (
        RegistroAuditoria.objects.exclude(username="")
        .order_by("username").values_list("username", flat=True).distinct()
    )
    modulos = RegistroAuditoria.objects.order_by("modulo").values_list("modulo", flat=True).distinct()

    return render_inertia(request, "Auditoria/Registro", {
        "registros": registros,
        "total": total,
        "limite": LIMITE,
        "filtros": filtros,
        "opciones": {
            "modulos": [{"value": m, "label": MODULOS.get(m, m)} for m in modulos],
            "usuarios": list(usuarios),
            "resultados": [{"value": v, "label": e} for v, e in RegistroAuditoria.RESULTADO_CHOICES],
        },
    })


@login_required
@permission_required("can_view_auditoria")
def api_registro_detalle(request, registro_id: int):
    """Un registro con su `detalle` (lo enviado, y el antes y el despues si los hay)."""
    registro = RegistroAuditoria.objects.filter(pk=registro_id).first()
    if registro is None:
        return JsonResponse({"status": "error", "message": "Registro no encontrado."}, status=404)
    return JsonResponse({
        **_fila(registro),
        "metodo": registro.metodo,
        "ruta": registro.ruta,
        "detalle": registro.detalle,
    })
