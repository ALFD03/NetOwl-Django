"""Nombres legibles de módulos y acciones del registro.

La acción es el nombre de la ruta; lo que no esté aquí se muestra por ese nombre,
así que un endpoint nuevo queda auditado aunque nadie lo traduzca.
"""

MODULES = {
    "auth": "Usuarios y acceso",
    "imports": "Importaciones",
    "subscriptions": "Suscripciones",
    "crm": "CRM",
    "support": "Soporte técnico",
    "catalogs": "Catálogos",
    "commissions": "Comisiones",
    "audit": "Auditoría",
    "analisis": "Análisis (worker)",
    "api": "API",
    # Registros anteriores a la API.
    "config": "Usuarios y acceso",
    "catalogos": "Catálogos",
    "comisiones": "Comisiones",
    "auditoria": "Auditoría",
}

ACTIONS = {
    "login": "Inicio de sesión",
    "logout": "Cierre de sesión",
    "login_fallido": "Credenciales incorrectas",
    "login_bloqueado": "Acceso bloqueado por intentos",
    "token_rechazado": "Token rechazado",
    "analisis_terminado": "Análisis terminado",
    "analisis_fallido": "Análisis fallido",
    "analisis_cancelado": "Análisis cancelado",
    # auth
    "tokens": "Tokens de API",
    "revoke_token": "Revocar token de API",
    "users": "Usuarios",
    "user_detail": "Eliminar usuario",
    "user_permissions": "Permisos de usuario",
    "user_password": "Cambio de contraseña",
    "groups": "Grupos",
    "group_detail": "Editar o eliminar grupo",
    # imports
    "import_subscriptions": "Carga de suscripciones",
    "import_subscription_logs": "Carga de logs de suscripciones",
    "import_free_plans": "Carga de planes gratuitos",
    "import_invoices": "Carga de facturas",
    "import_crm": "Carga de CRM",
    "import_support": "Carga de tickets",
    "import_support_logs": "Carga de logs de soporte",
    "run_subscriptions": "Análisis de suscripciones",
    "run_crm": "Análisis de CRM",
    "run_support": "Análisis de soporte",
    "job_cancel": "Detener análisis",
    # subscriptions
    "lifetime_run": "Cálculo de lifetime",
    "lifetime_detail": "Exportar lifetime",
    "churn_detail": "Exportar bajas",
    "eta_lock": "Bloqueo del reporte ETA",
    "eta_order_save": "Guardar orden ETA",
    "eta_order_delete": "Eliminar orden ETA",
    "eta_rate": "Tasa ETA",
    "eta_rate_fetch": "Consultar tasa ETA",
    # support
    "user_save": "Guardar usuario de soporte",
    "user_delete": "Eliminar usuario de soporte",
    "user_move": "Movimiento de usuario de soporte",
    "stage_save": "Guardar etapa",
    "stage_delete": "Eliminar etapa",
    # catalogs
    "save": "Guardar en catálogo",
    "save_batch": "Alta en bloque en catálogo",
    "delete": "Eliminar de catálogo",
    # commissions
    "sales": "Exportar ventas",
    "archive_detail": "Descargar cierre archivado",
    "period_save": "Guardar periodo",
    "period_close": "Cerrar periodo",
    "period_reopen": "Reabrir periodo",
    "period_delete": "Borrar periodo",
    "review_save": "Decisión de revisión",
    "manual_add": "Agregar venta a mano",
    "manual_remove": "Quitar venta a mano",
    "indicator_save": "Indicador de cumplimiento",
    "conditions_save": "Condiciones de pago",
}


def action_label(action: str) -> str:
    return ACTIONS.get(action) or action.removeprefix("api_").replace("_", " ").capitalize()
