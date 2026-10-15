import { readFileSync } from 'node:fs';
import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

// Single source of truth for design tokens, shared with the TypeScript side via
// `@/shared/constants/theme`. Never hardcode these hex values in components:
// use the Tailwind class (`bg-surface-primary`) or import the token (chart canvases).
const tokens = JSON.parse(
  readFileSync(new URL('./web/src/shared/constants/design-tokens.json', import.meta.url), 'utf8')
);

// Tema claro/oscuro. La interfaz se escribió para oscuro (`text-white`,
// `text-slate-400`, `bg-emerald-950/40`…), y en vez de duplicar cada clase con
// `dark:` las paletas se sirven como variables CSS: en `:root` valen lo de
// siempre y bajo `.light` cada tono toma el de su espejo (50↔950, 100↔900,
// 400↔600…). Así la misma clase sigue siendo «texto tenue» o «fondo hundido» en
// los dos temas. `brand` no se refleja: es el color de la marca en ambos.
const PALETAS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
];
const ESPEJO = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };

/** `#rrggbb` → `r g b`, el formato que admite `<alpha-value>` (`bg-slate-900/40`). */
const canales = (hex) => {
  // `colors.white` es `#fff`: los de tres dígitos se expanden antes de leerlos.
  const digitos = hex.length === 4 ? [...hex.slice(1)].map((d) => d + d).join('') : hex.slice(1);
  const n = parseInt(digitos, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const conVariable = (nombre) => `rgb(var(--c-${nombre}) / <alpha-value>)`;

const oscuro = {};
const claro = {};
const paletas = {};

for (const paleta of PALETAS) {
  paletas[paleta] = {};
  for (const [tono, espejo] of Object.entries(ESPEJO)) {
    oscuro[`--c-${paleta}-${tono}`] = canales(colors[paleta][tono]);
    claro[`--c-${paleta}-${tono}`] = canales(colors[paleta][espejo]);
    paletas[paleta][tono] = conVariable(`${paleta}-${tono}`);
  }
}

oscuro['--c-white'] = canales(colors.white);
claro['--c-white'] = canales(tokens.light.white);

const superficies = {};
for (const [nombre, valor] of Object.entries(tokens.surface)) {
  oscuro[`--c-surface-${nombre}`] = canales(valor);
  claro[`--c-surface-${nombre}`] = canales(tokens.light.surface[nombre]);
  superficies[nombre] = conVariable(`surface-${nombre}`);
}

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
        ...paletas,
        white: conVariable('white'),
        surface: superficies,
        brand: tokens.brand,
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...oscuro, colorScheme: 'dark' },
        '.light': { ...claro, colorScheme: 'light' },
      });
    }),
  ],
};
