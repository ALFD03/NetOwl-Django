/**
 * Arranque de la aplicación React.
 *
 * Resuelve cada página Inertia con el glob de `../pages` usando la cadena que
 * le pasó la vista Django, monta el proveedor de tema y prepara axios para el
 * CSRF.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import type { Page } from '@inertiajs/core';
import type { ComponentType } from 'react';

import { ThemeProvider } from '@/shared/hooks/useTheme';
import type { AppPageProps } from '@/shared/types/inertia';
import '../styles/global.css';

// Añade la cabecera X-CSRFToken a todas las peticiones Inertia.
import './csrf';

import '@/shared/charts/register';

/**
 * Every Inertia page, keyed by the identifier Django passes to `render()`
 * (e.g. `"CRM/Dashboard"`). The glob is resolved at build time, so the keys are
 * paths relative to THIS file — keep them and the lookup below in step.
 */
const PAGE_MODULES = import.meta.glob<{ default: ComponentType }>('../pages/**/*.tsx', {
  eager: true,
});

function parseInitialPage(value: string): Page<AppPageProps> | undefined {
  try {
    return JSON.parse(value) as Page<AppPageProps>;
  } catch (error) {
    console.error('Error parseando JSON de inertia-django:', error);
    return undefined;
  }
}

function readInitialPage(): Page<AppPageProps> | undefined {
  const scriptTag = document.querySelector('script[data-page="app"]');
  if (scriptTag?.textContent) {
    const parsed = parseInitialPage(scriptTag.textContent);
    if (parsed) return parsed;
  }

  const element = document.getElementById('app');
  return element?.dataset.page ? parseInitialPage(element.dataset.page) : undefined;
}

createInertiaApp({
  page: readInitialPage(),
  resolve: (name) => {
    const page = PAGE_MODULES[`../pages/${name}.tsx`];

    if (!page) {
      throw new Error(`Página Inertia no encontrada: ${name}`);
    }

    return page.default;
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <React.StrictMode>
        <ThemeProvider>
          <App {...props} />
        </ThemeProvider>
      </React.StrictMode>
    );
  },
});
