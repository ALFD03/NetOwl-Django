/**
 * Modo Inertia: resuelve cada página con el glob de `../pages` según la cadena
 * que pasó la vista Django. Las páginas ya migradas a la SPA quedan fuera del glob.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import type { Page } from '@inertiajs/core';
import type { ComponentType } from 'react';

import { StaticAuthProvider } from '@/shared/auth/AuthContext';
import { ThemeProvider } from '@/shared/hooks/useTheme';
import type { AuthUser, CurrentUser, Permission } from '@/shared/types/auth';
import type { AppPageProps } from '@/shared/types/inertia';

import './csrf';

const PAGE_MODULES = import.meta.glob<{ default: ComponentType }>(
  ['../pages/**/*.tsx', '!../pages/Config/Login.tsx'],
  { eager: true },
);

function readInitialPage(): Page<AppPageProps> | undefined {
  const raw =
    document.querySelector('script[data-page="app"]')?.textContent ||
    document.getElementById('app')?.dataset.page;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Page<AppPageProps>;
  } catch (error) {
    console.error('Error parseando JSON de inertia-django:', error);
    return undefined;
  }
}

/** El usuario de los props compartidos, con la forma de `/api/auth/me/`. */
function toCurrentUser(user: AuthUser | undefined): CurrentUser | null {
  if (!user) return null;
  const { role, ...matrix } = user.profile;
  return {
    id: user.id,
    username: user.username,
    is_superuser: user.is_superuser,
    role: role ?? null,
    group: null,
    permissions: matrix as Record<Permission, boolean>,
    landing: null,
    auth: 'session',
  };
}

export function startInertia() {
  createInertiaApp({
    page: readInitialPage(),
    resolve: (name) => {
      const page = PAGE_MODULES[`../pages/${name}.tsx`];
      if (!page) throw new Error(`Página Inertia no encontrada: ${name}`);
      return page.default;
    },
    setup({ el, App, props }) {
      createRoot(el).render(
        <React.StrictMode>
          <ThemeProvider>
            <App {...props}>
              {({ Component, props: pageProps, key }: { Component: ComponentType; props: AppPageProps; key: React.Key }) => (
                <StaticAuthProvider user={toCurrentUser(pageProps.auth?.user)}>
                  <Component key={key} {...pageProps} />
                </StaticAuthProvider>
              )}
            </App>
          </ThemeProvider>
        </React.StrictMode>,
      );
    },
  });
}
