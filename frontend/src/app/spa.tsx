/** Modo SPA: React Router + TanStack Query + la sesión de `/api/auth/me/`. */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AuthProvider } from '@/shared/auth/AuthContext';
import { ThemeProvider } from '@/shared/hooks/useTheme';

import { queryClient } from './queryClient';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export function startSpa() {
  createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
