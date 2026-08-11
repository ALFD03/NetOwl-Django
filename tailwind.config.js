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
        surface: {
          primary: '#0b1326',
          secondary: '#0f1a36',
          tertiary: '#12214a',
          hover: '#15285d',
        },
        brand: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};