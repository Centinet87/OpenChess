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

for (const [filePath, dependency, allowed] of cases) {
  test(`${filePath}: ${dependency} ${allowed ? 'permitido' : 'bloqueado'}`, async () => {
    const [result] = await eslint.lintText(
      `import * as dependency from '${dependency}';\nexport { dependency };\n`,
      { filePath },
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
  });
}
