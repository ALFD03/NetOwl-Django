import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import { ThemeProvider } from './context/ThemeContext';
import axios from 'axios';
import './styles/global.css';

// Configuración de CSRF para Django y Axios
axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx', { eager: true });
    const page = pages[`./pages/${name}.tsx`] as any;
    if (!page) {
      throw new Error(`Página Inertia no encontrada: ${name}`);
    }
    // ✅ RETORNAR page.default O page
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