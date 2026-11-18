/** La SPA: React Router + TanStack Query + la sesión de `/api/auth/me/`. */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AuthProvider } from '@/shared/auth/AuthContext';
import { onDataChanged } from '@/shared/lib/api/client';
import { ThemeProvider } from '@/shared/hooks/useTheme';

import { queryClient } from './queryClient';
import { routes } from './routes';

const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});

// Tras cualquier cambio en el servidor, lo que está en pantalla se vuelve a
// pedir y lo demás queda caducado para la próxima vez que se abra.
onDataChanged(() => void queryClient.invalidateQueries());

export function startSpa() {
  createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
