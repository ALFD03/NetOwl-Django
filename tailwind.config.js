import { readFileSync } from 'node:fs';

// Single source of truth for design tokens, shared with the TypeScript side via
// `@/shared/constants/theme`. Never hardcode these hex values in components:
// use the Tailwind class (`bg-surface-primary`) or import the token (chart canvases).
const tokens = JSON.parse(
  readFileSync(new URL('./web/src/shared/constants/design-tokens.json', import.meta.url), 'utf8')
);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './web/templates/**/*.html',
    './web/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    // Los breakpoints se declaran enteros (no en `extend`) para que no haya más
    // que estos cinco. Qué significa cada uno está en `shared/constants/breakpoints.ts`,
    // que lee los mismos valores para los hooks de JS.
    screens: tokens.screens,
    extend: {
      colors: {
        surface: tokens.surface,
        brand: tokens.brand,
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
