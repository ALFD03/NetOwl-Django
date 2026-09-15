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


def ip_cliente(request) -> str:
    """La direccion del cliente segun el proxy, o `REMOTE_ADDR` si no hay."""
    reenviada = request.META.get("HTTP_X_FORWARDED_FOR", "")
    for candidata in reversed([p.strip() for p in reenviada.split(",") if p.strip()]):
        # Puede venir entre corchetes (IPv6) o con puerto; si no se puede
        # interpretar, se prueba con la siguiente en vez de romper la peticion.
        limpia = candidata.strip("[]").rsplit("%", 1)[0]
        try:
            ipaddress.ip_address(limpia)
        except ValueError:
            continue
        return limpia

    return request.META.get("REMOTE_ADDR") or "0.0.0.0"
