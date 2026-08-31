import axios from 'axios';

// Add CSRF token to all Axios requests for Django Inertia.js
// This ensures Django's CSRF middleware accepts the requests
axios.defaults.withCredentials = true;

// Get CSRF token from meta tag and add to headers
const getCSRFToken = (): string | null => {
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  return metaTag ? metaTag.getAttribute('content') : null;
};

// Interceptor para añadir CSRF token a todas las peticiones Inertia.js
// Django espera la cabecera exacta: X-CSRFToken (mayúsculas)
axios.interceptors.request.use(
  (config) => {
    const token = getCSRFToken();
    if (token) {
      // Django requiere exactamente 'X-CSRFToken' (mayúsculas)
      config.headers['X-CSRFToken'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axios;