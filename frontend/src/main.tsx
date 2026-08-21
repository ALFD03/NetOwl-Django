import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Page } from '@inertiajs/core';
import type { ComponentType } from 'react';
import type { AppPageProps } from './types/inertia';
import { createInertiaApp } from '@inertiajs/react';
import { ThemeProvider } from './context/ThemeContext';
import axios from 'axios';
import './styles/global.css';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  BarController,
  LineController,
  DoughnutController,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  BarController,
  LineController,
  DoughnutController
);

axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

const scriptTag = document.querySelector('script[data-page="app"]');
let initialPage: Page<AppPageProps> | undefined;

function parseInitialPage(value: string): Page<AppPageProps> | undefined {
  try {
    return JSON.parse(value) as Page<AppPageProps>;
  } catch (error) {
    console.error('Error parseando JSON de inertia-django:', error);
    return undefined;
  }
}

if (scriptTag && scriptTag.textContent) {
  try {
    initialPage = parseInitialPage(scriptTag.textContent);
  } catch (e) {
    console.error('Error parseando JSON de inertia-django:', e);
  }
}

if (!initialPage) {
  const el = document.getElementById('app');
  if (el && el.dataset.page) {
    try {
      initialPage = parseInitialPage(el.dataset.page);
    } catch (e) {
      console.error('Error parseando dataset.page:', e);
    }
  }
}

createInertiaApp({
  page: initialPage,
  resolve: (name) => {
    const pages = import.meta.glob<{ default: ComponentType }>(
      './pages/**/*.tsx',
      { eager: true }
    );

    const page = pages[`./pages/${name}.tsx`];
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