"""Como se identifica al cliente para contar sus peticiones.

`django_ratelimit` con `key='ip'` lee `REMOTE_ADDR`, que detras de Nginx es
siempre la direccion del proxy: todos los usuarios caian en el mismo cubo y el
limite de 2/m de los calculos se convertia en un 2/m para toda la empresa.

La libreria admite `RATELIMIT_IP_META_KEY = 'HTTP_X_FORWARDED_FOR'`, pero eso
tiene dos problemas y por eso aqui hay una funcion en su lugar:

1. Si la cabecera no esta —una sonda de salud, alguien hablando directamente
   con el contenedor, un proxy mal configurado— la libreria lanza
   `ImproperlyConfigured` y la peticion acaba en un 500.
2. `X-Forwarded-For` es una lista, y cual de sus entradas es el cliente real
   depende de la configuracion del proxy.

Sobre el punto 2: se toma la entrada **de la derecha**, no la primera. Con la
directiva habitual de Nginx (`$proxy_add_x_forwarded_for`) la cabecera queda
como "<lo que mando el cliente>, <IP real del cliente>", asi que la primera
entrada la escribe el propio cliente y puede inventarsela —rotandola se
esquivaba el limite del login— mientras que la ultima la anade Nginx. Si en
cambio Nginx sobrescribe la cabecera con `$remote_addr`, solo hay una entrada y
las dos lecturas coinciden. La de la derecha es correcta en ambos casos.

Esto vale mientras haya **un solo** proxy delante. Con una cadena de proxies
habria que descartar tantas entradas por la derecha como saltos de confianza.
"""

import ipaddress
import json


def client_ip(request) -> str:
    """La direccion del cliente segun el proxy, o `REMOTE_ADDR` si no hay."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    for candidate in reversed([p.strip() for p in forwarded.split(",") if p.strip()]):
        # Puede venir entre corchetes (IPv6) o con puerto; si no se puede
        # interpretar, se prueba con la siguiente en vez de romper la peticion.
        clean = candidate.strip("[]").rsplit("%", 1)[0]
        try:
            ipaddress.ip_address(clean)
        except ValueError:
            continue
        return clean

    return request.META.get("REMOTE_ADDR") or "0.0.0.0"


def user_login(group, request) -> str:
    """La cuenta que se intenta abrir, para contar los fallos por cuenta.

    Con `key='post:username'` la libreria lee `request.POST`, que llega vacio
    cuando el formulario se envia como JSON -que es como lo envia la SPA-: la
    clave era la cadena vacia para todo el mundo, asi que los intentos de toda
    la empresa caian en un unico cubo. Cinco en cinco minutos, de quien fuera,
    dejaban sin poder entrar a todos, y el limite por cuenta no existia.

    Se lee el nombre del cuerpo, venga en JSON o en formulario, y se cuenta en
    minusculas: si no, escribir la misma cuenta con otras mayusculas abriria un
    cubo nuevo por cada variante. Sin nombre se cuenta por IP: devolver la
    cadena vacia volveria a crear el cubo comun.
    """
    name = ""
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body or b"{}")
        except (ValueError, UnicodeDecodeError):
            data = {}
        if isinstance(data, dict):
            name = data.get("username") or ""
    else:
        name = request.POST.get("username", "")
    name = str(name).strip().casefold()
    return f"usuario:{name}" if name else f"ip:{client_ip(request)}"
