import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import { ThemeProvider } from './context/ThemeContext';
import axios from 'axios';
import './styles/global.css';

// Configuración de CSRF para Django y Axios
axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

// 1. Leer el JSON inyectado por inertia-django en la etiqueta <script data-page="app">
const scriptTag = document.querySelector('script[data-page="app"]');
let initialPage: any = undefined;

if (scriptTag && scriptTag.textContent) {
  try {
    initialPage = JSON.parse(scriptTag.textContent);
  } catch (e) {
    console.error('Error parseando JSON de inertia-django:', e);
  }
}

// 2. Fallback si viniera en el data-page del div #app
if (!initialPage) {
  const el = document.getElementById('app');
  if (el && el.dataset.page) {
    try {
      initialPage = JSON.parse(el.dataset.page);
    } catch (e) {
      console.error('Error parseando dataset.page:', e);
    }
  }
}

createInertiaApp({
  page: initialPage, // 👈 LE PASAMOS EL OBJETO INICIAL PARSEADO DIRECTAMENTE A INERTIA
  resolve: (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx', { eager: true });
    const page = pages[`./pages/${name}.tsx`] as any;
    if (!page) {
      throw new Error(`Página Inertia no encontrada: ${name}`);
    }
    return page.default || page;
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