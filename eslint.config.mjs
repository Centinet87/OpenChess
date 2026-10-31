import nx from '@nx/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import { fileURLToPath } from 'node:url';

const apiModules = [
  'auth',
  'clubs',
  'games',
  'ratings',
  'linked-accounts',
  'billing',
  'tenant',
  'health',
];
const architectureRules = apiModules.flatMap((name) => {
  const modulePath = './apps/api/src/app/' + name;
  return [
    {
      basePath: fileURLToPath(new URL('.', import.meta.url)),
      files: ['apps/api/src/app/' + name + '/{domain,application}/**/*.ts'],
      plugins: { import: importPlugin },
      settings: { 'import/resolver': { node: { extensions: ['.ts', '.js'] } } },
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                regex:
                  name === 'games'
                    ? '^(?!\\.|node:|chess\\.js$)'
                    : '^(?!\\.|node:)',
                message:
                  'El núcleo depende de sus capas internas y herramientas puras.',
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
                target: modulePath + '/domain',
                from: '.',
                except: [
                  modulePath + '/domain',
                  ...(name === 'games' ? ['./node_modules/chess.js'] : []),
                ],
                message: 'El dominio solo depende del dominio.',
              },
              {
                target: modulePath + '/application',
                from: '.',
                except: [modulePath + '/domain', modulePath + '/application'],
                message:
                  'La aplicación solo depende de aplicación y dominio del mismo módulo.',
              },
            ],
          },
        ],
      },
    },
    {
      basePath: fileURLToPath(new URL('.', import.meta.url)),
      files: ['apps/api/src/app/' + name + '/api/**/*.ts'],
      plugins: { import: importPlugin },
      settings: { 'import/resolver': { node: { extensions: ['.ts', '.js'] } } },
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
                target: modulePath + '/api',
                from: [
                  './apps/api/src/app/infrastructure',
                  ...apiModules.map(
                    (feature) =>
                      './apps/api/src/app/' + feature + '/infrastructure',
                  ),
                ],
                message:
                  'La API accede a infraestructura a través de puertos y casos de uso.',
              },
            ],
          },
        ],
      },
    },
  ];
});

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
  ...architectureRules,
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
