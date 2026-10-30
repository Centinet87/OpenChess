import nx from '@nx/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import { fileURLToPath } from 'node:url';

/**
 * Reglas con información de tipos para el código async del backend: una promesa
 * que nadie espera se traga el error (p. ej. un bootstrap() sin catch).
 * Las usan apps/api y las libs desde su propio eslint.config.mjs.
 */
export const asyncRules = [
  {
    files: ['**/src/**/*.ts'],
    ignores: ['**/src/generated/**'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/src/generated'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          // scope: quién puede usar la lib. type: en qué capa está.
          depConstraints: [
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:data',
                'type:util',
              ],
            },
            // Un módulo de negocio no importa a otro: se comunican por eventos de dominio.
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: ['type:data', 'type:util'],
            },
            { sourceTag: 'type:data', onlyDependOnLibsWithTags: ['type:util'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/app/auth/{domain,application}/**/*.ts'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.|node:)',
              message:
                'El núcleo solo importa sus capas internas y módulos nativos de Node.',
            },
          ],
        },
      ],
      'import/no-restricted-paths': [
        'error',
        {
          basePath: fileURLToPath(new URL('.', import.meta.url)),
          zones: [
            {
              target: './apps/api/src/app/auth/domain',
              from: '.',
              except: ['./apps/api/src/app/auth/domain'],
              message: 'El dominio solo depende del dominio.',
            },
            {
              target: './apps/api/src/app/auth/application',
              from: '.',
              except: [
                './apps/api/src/app/auth/domain',
                './apps/api/src/app/auth/application',
              ],
              message: 'La aplicación solo depende de aplicación y dominio.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/app/auth/api/**/*.ts'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@prisma/**', '@openchess/database'] },
      ],
      'import/no-restricted-paths': [
        'error',
        {
          basePath: fileURLToPath(new URL('.', import.meta.url)),
          zones: [
            {
              target: './apps/api/src/app/auth/api',
              from: [
                './apps/api/src/app/auth/infrastructure',
                './apps/api/src/app/infrastructure',
              ],
              message:
                'La API accede a infraestructura a través de los casos de uso.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
