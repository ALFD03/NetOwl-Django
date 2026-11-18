/**
 * La instancia de axios de `/api/`, con el CSRF puesto.
 *
 * - Una escritura que sale bien avisa de que los datos cambiaron
 *   (`onDataChanged`): la app invalida su caché y lo que está en pantalla se
 *   vuelve a pedir.
 * - Un 401 fuera del login es una sesión caducada: se vuelve al login y, tras
 *   entrar, a la página donde se estaba.
 */

import axios from 'axios';

import { applyCsrf } from '../http/csrf';

/** Las que responden 401 como parte de su uso normal. */
const OWN_401 = ['/api/auth/me/', '/api/auth/login/'];

/** Escrituras que no tocan datos de ninguna página. */
const NOT_DATA = ['/api/auth/login/', '/api/auth/logout/'];

const READ_METHODS = ['get', 'head', 'options'];

type Listener = () => void;
const listeners = new Set<Listener>();
let pending: ReturnType<typeof setTimeout> | null = null;

/** Se llama cuando el servidor cambió datos (una escritura, un análisis terminado). */
export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Avisa de que hay datos nuevos; varios avisos seguidos cuentan como uno. */
export function notifyDataChanged(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    listeners.forEach((listener) => listener());
  }, 50);
}

export const apiClient = applyCsrf(axios.create({
  headers: {
    Accept: 'application/json',
  },
}));

apiClient.interceptors.response.use((response) => {
  const { method = 'get', url = '' } = response.config;
  if (!READ_METHODS.includes(method.toLowerCase()) && !NOT_DATA.includes(url)) notifyDataChanged();
  return response;
}, (error) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    !OWN_401.includes(error.config?.url ?? '') &&
    !window.location.pathname.startsWith('/auth/login')
  ) {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/auth/login/?next=${encodeURIComponent(next)}`);
  }
  return Promise.reject(error);
});

export { getApiErrorMessage } from '../http/errors';
