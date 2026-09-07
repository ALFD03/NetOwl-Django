import axios from 'axios';

import { getCsrfCookieName } from '../http/csrf';

export const apiClient = axios.create({
  headers: {
    Accept: 'application/json',
  },
});

// El nombre de la cookie CSRF depende del entorno (ver shared/lib/http/csrf)
apiClient.defaults.xsrfCookieName = getCsrfCookieName();
apiClient.defaults.xsrfHeaderName = 'X-CSRFToken';

export { extractApiError, getApiErrorMessage } from '../http/errors';
export type { ApiError, ApiErrorPayload } from '../http/errors';
