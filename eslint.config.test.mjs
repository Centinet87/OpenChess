import { relative, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const eslint = new ESLint({
  cwd: fileURLToPath(new URL('.', import.meta.url)),
});
const domain = 'apps/api/src/app/auth/domain/auth.types.ts';
const application =
  'apps/api/src/app/auth/application/use-cases/register.use-case.ts';
const api = 'apps/api/src/app/auth/api/controllers/auth.controller.ts';

const cases = [
  [domain, '../infrastructure/security/node-auth.crypto', false],
  [domain, '../../auth/infrastructure/security/node-auth.crypto', false],
  [domain, '../application/use-cases/register.use-case', false],
  [domain, './auth.error', true],
  [domain, 'zod', false],
  [
    application,
    '../../infrastructure/repositories/prisma-auth.repository',
    false,
  ],
  [application, '../../../config/env', false],
  [application, '../../api/handlers/auth-command.handlers', false],
  [application, '@nestjs/common', false],
  [application, '@openchess/database', false],
  [application, '../../domain/auth.types', true],
  [application, '../repositories/auth.repository', true],
  [application, 'node:crypto', true],
  [api, '../../infrastructure/repositories/prisma-auth.repository', false],
  [api, '../../../infrastructure/prisma.module', false],
  [api, '@openchess/database', false],
  [api, '../../application/use-cases/register.use-case', true],
  [api, '@nestjs/cqrs', true],
];

cases.push(
  ...[
    ['apps/api/src/app/clubs/domain/entities/club.ts', '@nestjs/common', false],
    [
      'apps/api/src/app/clubs/domain/entities/club.ts',
      '../../application/queries/clubs.queries',
      false,
    ],
    [
      'apps/api/src/app/clubs/application/use-cases/clubs.use-cases.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/clubs/application/use-cases/clubs.use-cases.ts',
      '../../infrastructure/repositories/prisma-clubs.repository',
      false,
    ],
    [
      'apps/api/src/app/clubs/application/use-cases/clubs.use-cases.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/clubs/api/controllers/clubs.controller.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/clubs/api/controllers/clubs.controller.ts',
      '@openchess/database',
      false,
    ],
    ['apps/api/src/app/games/domain/entities/game.ts', '@nestjs/common', false],
    [
      'apps/api/src/app/games/domain/entities/game.ts',
      '../../application/queries/games.queries',
      false,
    ],
    [
      'apps/api/src/app/games/application/use-cases/games.use-cases.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/games/application/use-cases/games.use-cases.ts',
      '../../infrastructure/repositories/prisma-games.repository',
      false,
    ],
    [
      'apps/api/src/app/games/application/use-cases/games.use-cases.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/games/api/controllers/games.controller.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/games/api/controllers/games.controller.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/ratings/domain/entities/rating.ts',
      '@nestjs/common',
      false,
    ],
    [
      'apps/api/src/app/ratings/domain/entities/rating.ts',
      '../../application/queries/ratings.queries',
      false,
    ],
    [
      'apps/api/src/app/ratings/application/use-cases/ratings.use-cases.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/ratings/application/use-cases/ratings.use-cases.ts',
      '../../infrastructure/repositories/prisma-ratings.repository',
      false,
    ],
    [
      'apps/api/src/app/ratings/application/use-cases/ratings.use-cases.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/ratings/api/controllers/ratings.controller.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/ratings/api/controllers/ratings.controller.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/domain/entities/platform.ts',
      '@nestjs/common',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/domain/entities/platform.ts',
      '../../application/queries/linked-accounts.queries',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/application/use-cases/linked-accounts.use-cases.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/application/use-cases/linked-accounts.use-cases.ts',
      '../../infrastructure/repositories/prisma-linked-accounts.repository',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/application/use-cases/linked-accounts.use-cases.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/api/controllers/linked-accounts.controller.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/linked-accounts/api/controllers/linked-accounts.controller.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/billing/domain/entities/plan.ts',
      '@nestjs/common',
      false,
    ],
    [
      'apps/api/src/app/billing/domain/entities/plan.ts',
      '../../application/queries/billing.queries',
      false,
    ],
    [
      'apps/api/src/app/billing/application/use-cases/billing.use-cases.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/billing/application/use-cases/billing.use-cases.ts',
      '../../infrastructure/repositories/prisma-subscriptions.repository',
      false,
    ],
    [
      'apps/api/src/app/billing/application/use-cases/billing.use-cases.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/billing/api/controllers/plan.controller.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/billing/api/controllers/plan.controller.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/tenant/application/use-cases/resolve-tenant.use-case.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/tenant/application/use-cases/resolve-tenant.use-case.ts',
      '../../infrastructure/repositories/prisma-tenant.repository',
      false,
    ],
    [
      'apps/api/src/app/tenant/application/use-cases/resolve-tenant.use-case.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/tenant/api/middleware/tenant.middleware.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/tenant/api/middleware/tenant.middleware.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/health/application/use-cases/check-health.use-case.ts',
      '@openchess/database',
      false,
    ],
    [
      'apps/api/src/app/health/application/use-cases/check-health.use-case.ts',
      '../../infrastructure/repositories/prisma-health.repository',
      false,
    ],
    [
      'apps/api/src/app/health/application/use-cases/check-health.use-case.ts',
      '../../../auth/domain/auth.error',
      false,
    ],
    [
      'apps/api/src/app/health/api/controllers/app.controller.ts',
      '../../../infrastructure/prisma.module',
      false,
    ],
    [
      'apps/api/src/app/health/api/controllers/app.controller.ts',
      '@openchess/database',
      false,
    ],
  ],
);

cases.push(
  ['apps/api/src/app/games/domain/entities/game.ts', 'chess.js', true],
  ['apps/api/src/app/clubs/domain/entities/club.ts', 'chess.js', false],
  [
    'apps/api/src/app/clubs/application/use-cases/clubs.use-cases.ts',
    '../repositories/clubs.ports',
    true,
  ],
  [
    'apps/api/src/app/clubs/api/controllers/clubs.controller.ts',
    '../../../billing/infrastructure/repositories/prisma-subscriptions.repository',
    false,
  ],
  [
    'apps/api/src/app/games/api/controllers/games.controller.ts',
    '../../application/commands/games.commands',
    true,
  ],
  [
    'apps/api/src/app/tenant/api/middleware/tenant.middleware.ts',
    '../../application/queries/tenant.queries',
    true,
  ],
  [
    'apps/api/src/app/health/api/controllers/app.controller.ts',
    '../../application/queries/health.queries',
    true,
  ],
  [
    'apps/api/src/app/ratings/api/controllers/ratings.controller.ts',
    '../../../games/application/events/game.events',
    true,
  ],
);

const root = fileURLToPath(new URL('.', import.meta.url));
for (const cwd of [root, resolve(root, 'apps/api')]) {
  const scoped = cwd === root ? eslint : new ESLint({ cwd });
  for (const [filePath, dependency, allowed] of cases) {
    test(
      cwd +
        ': ' +
        filePath +
        ': ' +
        dependency +
        ' ' +
        (allowed ? 'permitido' : 'bloqueado'),
      async () => {
        const [result] = await scoped.lintText(
          `import * as dependency from '${dependency}';\nexport { dependency };\n`,
          { filePath: relative(cwd, resolve(root, filePath)) },
        );
        const violations = result.messages.filter((message) =>
          ['no-restricted-imports', 'import/no-restricted-paths'].includes(
            message.ruleId,
          ),
        );
        assert.equal(
          violations.length > 0,
          !allowed,
          JSON.stringify(result.messages),
        );
      },
    );
  }
}
