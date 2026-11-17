/** `/api/auth/`: sesión e identidad. */

import axios from 'axios';

import { apiClient } from './client';
import type { CurrentUser } from '@/shared/types/auth';

export const authApi = {
  /** La cuenta actual, o null sin sesión. También deja la cookie CSRF. */
  me: async (): Promise<CurrentUser | null> => {
    try {
      return (await apiClient.get<CurrentUser>('/api/auth/me/')).data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) return null;
      throw error;
    }
  },
  login: async (username: string, password: string) =>
    (await apiClient.post<CurrentUser>('/api/auth/login/', { username, password })).data,
  logout: async () => {
    await apiClient.post('/api/auth/logout/');
  },
};

export interface ApiTokenRow {
  id: number;
  name: string;
  prefix: string;
  user: { id: number; username: string };
  created_by: string | null;
  created_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  active: boolean;
}

export interface CreateTokenRequest {
  user_id: number;
  name: string;
  expires_in_days: number | null;
}

/** `/api/auth/tokens/`: los tokens con que otras aplicaciones usan la API. */
export const tokensApi = {
  list: async () => (await apiClient.get<{ tokens: ApiTokenRow[] }>('/api/auth/tokens/')).data.tokens,
  /** El valor en claro (`token`) solo viaja en esta respuesta. */
  create: async (request: CreateTokenRequest) =>
    (await apiClient.post<ApiTokenRow & { token: string }>('/api/auth/tokens/', request)).data,
  revoke: async (id: number) => (await apiClient.post<ApiTokenRow>(`/api/auth/tokens/${id}/revoke/`)).data,
};
