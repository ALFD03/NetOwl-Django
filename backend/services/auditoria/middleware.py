"""El middleware que anota cada escritura en el registro de auditoria."""

from __future__ import annotations

import json
import logging

from .registro import registrar, resultado_de, resumir_objeto

logger = logging.getLogger(__name__)

METODOS_DE_ESCRITURA = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Rutas que el middleware no anota: la entrada y la salida las anotan las
# senales de autenticacion (`signals.py`), que saben si las credenciales eran
# buenas; aqui solo se veria un POST con la contrasena dentro.
EXCLUIDAS = frozenset({("config", "login"), ("config", "logout")})

# Lecturas que si se anotan: las que sacan del sistema datos de clientes en
# bloque (el detalle orden a orden que alimenta las exportaciones). Ver una
# pantalla no se audita; llevarse la lista de bajas, si.
LECTURAS_AUDITADAS = frozenset({
    ("subscriptions", "api_lifetime_detalle"),
    ("subscriptions", "api_bajas_detalle"),
    ("comisiones", "api_ventas"),
})

# Lo que se lee de una respuesta JSON para sacar su mensaje. Por encima, no se
# abre: una respuesta grande es un listado, no un mensaje.
MAX_RESPUESTA = 64 * 1024


def _cuerpo(request):
    """Lo que envio el usuario, en una forma que se pueda guardar."""
    if request.method == "GET":
        return {clave: valores if len(valores) > 1 else valores[0] for clave, valores in request.GET.lists()}
    tipo = request.content_type or ""
    if tipo == "application/json":
        try:
            return json.loads(request.body or b"null")
        except Exception:
            return None
    if tipo.startswith("multipart/") or tipo == "application/x-www-form-urlencoded":
        # Los ficheros, por nombre y tamano: nunca su contenido.
        datos = {clave: request.POST.get(clave) for clave in request.POST}
        archivos = [
            {"campo": campo, "nombre": f.name, "bytes": f.size}
            for campo in request.FILES
            for f in request.FILES.getlist(campo)
        ]
        if archivos:
            datos["archivos"] = archivos
        return datos
    return None


def _mensaje(response) -> str:
    """El `message` de una respuesta JSON, que es lo que vio el usuario."""
    if "application/json" not in response.get("Content-Type", ""):
        return ""
    contenido = getattr(response, "content", b"")
    if not contenido or len(contenido) > MAX_RESPUESTA:
        return ""
    try:
        datos = json.loads(contenido)
    except ValueError:
        return ""
    return str(datos.get("message") or "") if isinstance(datos, dict) else ""


class AuditoriaMiddleware:
    """Anota en `RegistroAuditoria` toda escritura que llega a una vista.

    Se decide despues de la respuesta, con la ruta ya resuelta: el modulo es el
    `app_name` y la accion el nombre de la ruta, asi que un endpoint nuevo queda
    auditado sin tocar nada. Lo que el usuario envio se guarda limpio de
    contrasenas y tokens (`registro.limpiar`); el resultado sale del codigo HTTP
    y la descripcion del mensaje que se le devolvio.

    Va despues de `AuthenticationMiddleware` y antes del limitador, para ver
    tambien los 429. Una peticion anonima de escritura no llega aqui: la corta
    antes `LimiteCuerpoAnonimoMiddleware`.

    Nunca rompe la peticion: cualquier fallo al anotar va al log.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._anotar(request, response)
        except Exception:
            logger.exception("Fallo al anotar la petición en auditoría")
        return response

    def _anotar(self, request, response) -> None:
        coincidencia = getattr(request, "resolver_match", None)
        if coincidencia is None or not coincidencia.url_name:
            return
        modulo = coincidencia.namespace or (coincidencia.app_names[0] if coincidencia.app_names else "")
        clave = (modulo, coincidencia.url_name)
        if clave in EXCLUIDAS:
            return
        if request.method not in METODOS_DE_ESCRITURA and clave not in LECTURAS_AUDITADAS:
            return

        cuerpo = _cuerpo(request)
        registrar(
            request,
            modulo=modulo or "general",
            accion=coincidencia.url_name,
            descripcion=_mensaje(response),
            objeto=resumir_objeto(cuerpo),
            detalle={"peticion": cuerpo, "parametros": coincidencia.kwargs or None},
            resultado=resultado_de(response.status_code),
            estado_http=response.status_code,
        )
