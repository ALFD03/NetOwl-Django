"""Control de acceso de las vistas.

Dos decoradores —uno que combina permisos con OR y otro con AND— y la
respuesta que recibe quien no pasa: JSON 403 si pedia datos, o una
redireccion a la primera pagina que si pueda abrir si estaba navegando. Esa
lista de destinos es `LANDING_ROUTES`, y vive aqui y no en `models.py` porque
es una decision de enrutado.
"""

# --- START OF FILE NetOwl-Django/frontend/config/decorators.py ---
from functools import wraps

from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.html import escape

# Paginas de aterrizaje ordenadas por prioridad: (nombre de ruta, permisos que
# exige la vista). Cuando se le niega el acceso a un usuario, se le envia a la
# primera entrada que realmente pueda abrir, en vez de al dashboard de
# Subscriptions (que quiza tampoco tenga permitido, provocando un rebote).
LANDING_ROUTES = [
    ('subscriptions:dashboard', ('can_view_subscriptions',)),
    ('crm:dashboard', ('can_view_crm',)),
    ('support:dashboard', ('can_view_support',)),
    ('subscriptions:analytics', ('can_view_subs_analytics',)),
    ('subscriptions:results', ('can_view_subs_results',)),
    ('subscriptions:lifetime', ('can_view_subs_lifetime',)),
    ('subscriptions:sales_report', ('can_view_subs_sales',)),
    ('subscriptions:eta_report', ('can_view_eta',)),
    ('crm:analytics', ('can_view_crm_analytics',)),
    ('crm:results', ('can_view_crm_results',)),
    ('support:analytics', ('can_view_support_analytics',)),
    ('support:results', ('can_view_support_results',)),
    ('imports:subscriptions', ('can_view_imports', 'can_view_imports_subs')),
    ('imports:crm', ('can_view_imports', 'can_view_imports_crm')),
    ('imports:support', ('can_view_imports', 'can_view_imports_support')),
    ('imports:history', ('can_view_imports', 'can_view_import_history')),
    ('subscriptions:catalogos', ('can_manage_catalogos',)),
    ('config:user_management', ('can_manage_users',)),
]


def is_inertia(request):
    """Peticion de navegacion de Inertia (espera una respuesta de Inertia)."""
    return request.headers.get('x-inertia') == 'true'


def is_ajax_or_api(request):
    """Peticion de datos que espera JSON.

    Inertia viaja sobre axios, que envia `X-Requested-With: XMLHttpRequest` en
    cada visita de pagina. Por eso se descarta primero: si no, una pagina
    denegada recibiria un JSON crudo y React reventaria con "All Inertia
    requests must receive a valid Inertia response".
    """
    if is_inertia(request):
        return False
    return (
        request.headers.get('x-requested-with') == 'XMLHttpRequest' or
        request.path.startswith('/api/') or
        '/api/' in request.path
    )


def resolve_landing_url(request):
    """Primera pagina que este usuario si puede abrir, o None si no hay ninguna."""
    if request.user.is_superuser:
        return reverse('subscriptions:dashboard')

    profile = getattr(request.user, 'profile', None)
    if profile is None:
        return None

    for route_name, required in LANDING_ROUTES:
        if all(profile.has_permission(perm) for perm in required):
            url = reverse(route_name)
            # Nunca rebotar a la misma URL que se acaba de denegar.
            if url != request.path:
                return url
    return None


def deny(request, message):
    """Respuesta de acceso denegado adecuada al tipo de peticion."""
    if is_ajax_or_api(request):
        return JsonResponse({"status": "error", "message": message}, status=403)

    landing = resolve_landing_url(request)
    if landing:
        return redirect(landing)

    # El usuario no tiene ninguna pagina disponible: cortar aqui evita un bucle
    # de redirecciones entre vistas que tampoco puede ver.
    # `escape`: hoy todos los llamantes pasan literales, pero esto es HTML
    # crudo y basta con que alguien interpole un parametro de la peticion para
    # convertirlo en un XSS reflejado.
    return HttpResponseForbidden(
        f"<h1>Acceso denegado</h1><p>{escape(message)}</p>"
        "<p>Tu cuenta no tiene ningún módulo asignado. Contacta al administrador.</p>"
    )


def _authorize(perm_names, combine):
    """Fabrica de decoradores: `combine` es `any` (OR) o `all` (AND)."""
    # `all([])` es True: un `@permissions_all_required()` sin argumentos
    # autorizaria a cualquier usuario autenticado. Ningun punto de uso lo hace
    # hoy; esto impide que el dia que ocurra pase desapercibido.
    if not perm_names:
        raise ImproperlyConfigured(
            "Los decoradores de permisos exigen al menos un permiso."
        )

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                if is_ajax_or_api(request):
                    return JsonResponse({"status": "error", "message": "Autenticación requerida."}, status=401)
                return redirect('config:login')

            # Superusuarios de Django siempre tienen acceso total
            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)

            profile = getattr(request.user, 'profile', None)
            if profile and combine(profile.has_permission(perm) for perm in perm_names):
                return view_func(request, *args, **kwargs)

            joiner = ' o ' if combine is any else ' y '
            return deny(request, f"Acceso denegado. Se requiere el privilegio: {joiner.join(perm_names)}.")
        return _wrapped_view
    return decorator


def permission_required(*perm_names):
    """
    Exige que el usuario esté autenticado y posea el permiso requerido
    evaluado a través de su perfil o su Grupo de Permisos asignado.

    Admite varios permisos: basta con uno para pasar. Se usa en endpoints que
    alimentan a más de una página, p. ej. las dimensiones del CRM, que consultan
    tanto Analytics como el modal de Results.
    """
    return _authorize(perm_names, any)


def permissions_all_required(*perm_names):
    """Como `permission_required`, pero exige **todos** los permisos.

    Se usa cuando una pagina vive detras de dos puertas: el permiso del modulo
    y el de la pagina concreta. Ejemplo: `/imports/crm/` requiere ver el modulo
    de Importaciones *y* esa pestana en particular, de modo que apagar el
    modulo sigue cerrando el acceso por URL directa.
    """
    return _authorize(perm_names, all)


# --- DECORADORES DE COMPATIBILIDAD QUE DELEGAN A PERMISOS DINÁMICOS ---
def admin_required(view_func):
    """Compatibilidad: equivale a `permission_required('can_manage_users')`."""
    return permission_required('can_manage_users')(view_func)

def analyst_or_admin_required(view_func):
    """Compatibilidad: equivale a `permission_required('can_import_data')`."""
    return permission_required('can_import_data')(view_func)
# --- END OF FILE NetOwl-Django/frontend/config/decorators.py ---
