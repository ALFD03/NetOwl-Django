import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['web/static/dist', 'node_modules', 'staticfiles', 'graphify-out'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        localStorage: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Queda en aviso a proposito. La regla marca cualquier setState sincrono
      // dentro de un efecto, y aqui los cuatro casos son efectos de carga de
      // datos idiomaticos (`setLoading(true)` antes del fetch, limpiar el
      // estado cuando no hay periodo). Reescribirlos para callarla dejaria el
      // codigo peor, pero conviene seguir viendolos por si aparece uno que si
      // sea una cascada de renders.
      'react-hooks/set-state-in-effect': 'warn',

      // La regla de capas de web/src/README.md, hasta ahora sostenida solo por
      // disciplina. Un feature no importa otro feature, y `shared/` no sabe que
      // los features existen: lo comun se promueve, no se cruza.
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/pages/*', '**/pages/*'],
            message: 'pages/ es el contrato con Django: nadie importa de ahi.',
          },
        ],
      }],
    },
  },
  {
    // `shared/` es la capa de abajo: no puede conocer los features.
    files: ['web/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/features/*', '**/features/*'],
          message: 'shared/ no puede importar de features/: promueve lo comun a shared/.',
        }],
      }],
    },
  },
  ...['subscriptions', 'crm', 'support', 'imports', 'config'].map((dominio) => ({
    // Cada feature solo puede importar de si mismo y de shared/.
    files: [`web/src/features/${dominio}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/features/*', '!@/features/' + dominio, '!@/features/' + dominio + '/**'],
          message: 'Un feature no importa otro feature: promueve lo comun a shared/.',
        }],
      }],
    },
  })),
  prettier,
);
