/**
 * La instancia de axios de `/api/`, con el CSRF puesto.
 *
 * Un 401 fuera del login es una sesión caducada: se vuelve al login y, tras
 * entrar, a la página donde se estaba.
 */

import axios from 'axios';

import { applyCsrf } from '../http/csrf';

/** Las que responden 401 como parte de su uso normal. */
const OWN_401 = ['/api/auth/me/', '/api/auth/login/'];

export const apiClient = applyCsrf(axios.create({
  headers: {
    Accept: 'application/json',
  },
}));

apiClient.interceptors.response.use(undefined, (error) => {
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
