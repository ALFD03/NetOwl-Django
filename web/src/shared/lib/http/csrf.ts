import type { AxiosInstance } from 'axios';

/**
 * Lectura del token CSRF de Django.
 *
 * El nombre de la cookie cambia por entorno (CSRF_COOKIE_NAME en settings.py)
 * para que desarrollo y produccion no se pisen las cookies al compartir host,
 * asi que se lee del meta tag `csrf-cookie-name` en vez de hardcodearlo.
 *
 * Se prioriza la cookie sobre el meta tag `csrf-token`: el meta queda congelado
 * con el valor que tenia la pagina al renderizarse, y si el token rota despues
 * (otro inicio de sesion, otra pestaña) enviar el valor viejo produce un 403.
 */

const DEFAULT_CSRF_COOKIE_NAME = 'csrftoken';

/** Django la compara con esta capitalizacion exacta. */
const CSRF_HEADER = 'X-CSRFToken';

const readMeta = (name: string): string | null => {
  const tag = document.querySelector(`meta[name="${name}"]`);
  return tag?.getAttribute('content') || null;
};

export const getCsrfCookieName = (): string =>
  readMeta('csrf-cookie-name') || DEFAULT_CSRF_COOKIE_NAME;

const readCookie = (name: string): string | null => {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
};

export const getCsrfToken = (): string | null =>
  readCookie(getCsrfCookieName()) || readMeta('csrf-token');

/**
 * Configura una instancia de axios para que Django acepte sus peticiones.
 *
 * Habia dos instancias con estrategias distintas: la global que usa Inertia
 * ponia la cabecera con un interceptor, y `apiClient` se apoyaba en el
 * mecanismo `xsrfCookieName` interno de axios, que solo actua bajo ciertas
 * condiciones de origen y credenciales. Se unifican en la explicita: Django
 * exige la cabecera `X-CSRFToken` con esa capitalizacion exacta, y ponerla a
 * mano no depende de heuristicas del cliente.
 *
 * El token se lee en cada peticion, no al configurar: si la cookie rota
 * mientras la pestana sigue abierta, mandar el valor viejo da un 403.
 */
export const applyCsrf = <T extends AxiosInstance>(instance: T): T => {
  instance.defaults.withCredentials = true;
  instance.defaults.xsrfCookieName = getCsrfCookieName();
  instance.defaults.xsrfHeaderName = CSRF_HEADER;

  instance.interceptors.request.use((config) => {
    const token = getCsrfToken();
    if (token) config.headers.set(CSRF_HEADER, token);
    return config;
  });

  return instance;
};
