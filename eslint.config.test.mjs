import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const eslint = new ESLint({
  cwd: fileURLToPath(new URL('.', import.meta.url)),
});
const domain = 'apps/api/src/app/auth/domain/auth.types.ts';
const application = 'apps/api/src/app/auth/application/auth.service.ts';

const cases = [
  [domain, '../infrastructure/security/node-auth.crypto', false],
  [domain, '../../auth/infrastructure/security/node-auth.crypto', false],
  [domain, '../application/auth.service', false],
  [domain, './auth.error', true],
  [domain, 'zod', false],
  [application, '../infrastructure/prisma/prisma-auth.repository', false],
  [application, '../../config/env', false],
  [application, '@nestjs/common', false],
  [application, '@openchess/database', false],
  [application, '../domain/auth.types', true],
  [application, './ports/auth.repository', true],
  [application, 'node:crypto', true],
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
