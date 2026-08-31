import { readFileSync } from 'node:fs';

// Single source of truth for design tokens, shared with the TypeScript side via
// `@/shared/constants/theme`. Never hardcode these hex values in components:
// use the Tailwind class (`bg-surface-primary`) or import the token (chart canvases).
const tokens = JSON.parse(
  readFileSync(new URL('./frontend/src/shared/constants/design-tokens.json', import.meta.url), 'utf8')
);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './frontend/templates/**/*.html',
    './frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
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
