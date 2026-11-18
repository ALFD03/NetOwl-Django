/**
 * La cuenta autenticada, para cualquier componente: `useAuth()`.
 *
 * `AuthProvider` la pide a `/api/auth/me/`; sin sesión, `user` es null.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authApi } from '@/shared/lib/api/auth';
import type { CurrentUser } from '@/shared/types/auth';

export interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me, staleTime: 5 * 60_000 });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => queryClient.clear(),
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      isLoading: me.isPending,
      login: (username, password) => loginMutation.mutateAsync({ username, password }),
      logout: () => logoutMutation.mutateAsync(),
    }),
    [me.data, me.isPending, loginMutation, logoutMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de un AuthProvider');
  return context;
}
