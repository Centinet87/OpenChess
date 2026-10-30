import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../../../app.module';
import { TokenCleanup } from './token-cleanup';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const email = `cleanup-${randomUUID().slice(0, 8)}@test.local`;
let app: NestExpressApplication;
let userId: string;

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication<NestExpressApplication>();
  await app.init();
  userId = (
    await base.user.create({
      data: { email, passwordHash: 'x', displayName: 'Limpieza' },
    })
  ).id;
});

afterAll(async () => {
  await app.close();
  await base.user.deleteMany({ where: { email } });
  await base.$disconnect();
});

it('borra los tokens vencidos y deja los vigentes, aunque estén revocados', async () => {
  const hour = 60 * 60 * 1000;
  const past = new Date(Date.now() - hour);
  const future = new Date(Date.now() + hour);
  const familyId = randomUUID();
  const refresh = (expiresAt: Date, revokedAt: Date | null = null) => ({
    userId,
    familyId,
    tokenHash: randomUUID(),
    expiresAt,
    revokedAt,
  });
  await base.refreshToken.createMany({
    data: [refresh(past), refresh(future), refresh(future, past)],
  });
  await base.emailToken.createMany({
    data: [past, future].map((expiresAt) => ({
      userId,
      purpose: 'VERIFY_EMAIL' as const,
      tokenHash: randomUUID(),
      expiresAt,
    })),
  });

  const deleted = await app.get(TokenCleanup).run();
  expect(deleted.refreshTokens).toBeGreaterThanOrEqual(1);
  expect(deleted.emailTokens).toBeGreaterThanOrEqual(1);

  const left = await base.refreshToken.findMany({ where: { userId } });
  expect(left).toHaveLength(2);
  expect(left.every((t) => t.expiresAt > new Date())).toBe(true);
  expect(
    await base.emailToken.count({
      where: { userId, expiresAt: { gt: new Date() } },
    }),
  ).toBe(1);
  expect(await base.emailToken.count({ where: { userId } })).toBe(1);
});
