/** La instancia de axios de los endpoints `api/`, ya preparada para el CSRF. */

import axios from 'axios';

import { applyCsrf } from '../http/csrf';

export const apiClient = applyCsrf(axios.create({
  headers: {
    Accept: 'application/json',
  },
}));

export { extractApiError, getApiErrorMessage, JobFailedError } from '../http/errors';
export type { ApiError, ApiErrorPayload } from '../http/errors';
