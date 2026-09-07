import axios from 'axios';

import { getCsrfToken, getCsrfCookieName } from '../shared/lib/http/csrf';

// Add CSRF token to all Axios requests for Django Inertia.js
// This ensures Django's CSRF middleware accepts the requests
axios.defaults.withCredentials = true;
axios.defaults.xsrfCookieName = getCsrfCookieName();
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

// Interceptor para anadir CSRF token a todas las peticiones Inertia.js
// Django espera la cabecera exacta: X-CSRFToken (mayusculas)
axios.interceptors.request.use(
  (config) => {
    // Se lee en cada peticion (no al cargar la pagina) para no enviar un token
    // viejo si la cookie roto mientras la pestana seguia abierta.
    const token = getCsrfToken();
    if (token) {
      // Django requiere exactamente 'X-CSRFToken' (mayusculas)
      config.headers['X-CSRFToken'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axios;
