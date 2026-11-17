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
