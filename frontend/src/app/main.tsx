/**
 * Arranque. Mientras dure la migración conviven dos modos con el mismo bundle:
 *
 * - **Inertia**: la vista Django mandó `data-page` → `./inertia` (páginas aún no migradas).
 * - **SPA**: sin `data-page` → `./spa`, React Router contra la API.
 *
 * Cada modo es un chunk aparte: la SPA no carga las páginas de Inertia.
 */

import '../styles/global.css';
import '@/shared/charts/register';

const root = document.getElementById('app');
const inertiaPage = root?.dataset.page || document.querySelector('script[data-page="app"]')?.textContent;

if (inertiaPage) {
  void import('./inertia').then(({ startInertia }) => startInertia());
} else {
  void import('./spa').then(({ startSpa }) => startSpa());
}
