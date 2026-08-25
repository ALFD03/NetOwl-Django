import axios from 'axios';

export const apiClient = axios.create({
  headers: {
    Accept: 'application/json',
  },
});

apiClient.defaults.xsrfCookieName = 'csrftoken';
apiClient.defaults.xsrfHeaderName = 'X-CSRFToken';

export { extractApiError, getApiErrorMessage } from '../http/errors';
export type { ApiError, ApiErrorPayload } from '../http/errors';
