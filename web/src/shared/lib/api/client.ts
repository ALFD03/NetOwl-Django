import axios from 'axios';

import { applyCsrf } from '../http/csrf';

export const apiClient = applyCsrf(axios.create({
  headers: {
    Accept: 'application/json',
  },
}));

export { extractApiError, getApiErrorMessage } from '../http/errors';
export type { ApiError, ApiErrorPayload } from '../http/errors';
