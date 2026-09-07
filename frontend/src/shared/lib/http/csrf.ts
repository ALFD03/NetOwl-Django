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
