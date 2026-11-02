import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { ClsService } from 'nestjs-cls';
import { createPrismaClient } from '@openchess/database';
import { TenantPrisma } from '../../infrastructure/prisma.module';
import { REFRESH_TTL_MS, REFRESH_GRACE_MS } from '../domain/auth.types';
import { AuthError } from '../domain/auth.error';
import { PrismaAuthRepository } from '../infrastructure/repositories/prisma-auth.repository';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const otherBase = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const prisma = new TenantPrisma(base, new ClsService(new AsyncLocalStorage()));
const otherPrisma = new TenantPrisma(
  otherBase,
  new ClsService(new AsyncLocalStorage()),
);
const repository = new PrismaAuthRepository(prisma);
const otherRepository = new PrismaAuthRepository(otherPrisma);
const email = `repository-${randomUUID()}@test.local`;
const duplicateEmail = `duplicate-${email}`;
let userId: string;

function replacement() {
  return {
    tokenHash: randomUUID(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  };
}

function seedSession(expiresAt = replacement().expiresAt) {
  return base.refreshToken.create({
    data: { ...replacement(), expiresAt, userId, familyId: randomUUID() },
  });
}

async function waitForBlockedQueries(holderPid: number, expected: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [row] = await base.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE ${holderPid} = ANY(pg_blocking_pids(pid))`;
    if (row.count >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No se bloquearon ${expected} operaciones sobre la familia`);
}

beforeAll(async () => {
  const user = await repository.createUser({
    email,
    displayName: 'Audit',
    passwordHash: 'synthetic-hash',
  });
  userId = user.id;
});

afterEach(async () => {
  jest.restoreAllMocks();
  await base.refreshToken.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await base.user.deleteMany({
    where: { email: { in: [email, duplicateEmail] } },
  });
  await Promise.all([base.$disconnect(), otherBase.$disconnect()]);
});

describe('PrismaAuthRepository', () => {
  it('traduce la colisión de dos registros concurrentes al error de dominio', async () => {
    const input = {
      email: duplicateEmail,
      displayName: 'Audit',
      passwordHash: 'synthetic-hash',
    };
    const results = await Promise.allSettled([
      repository.createUser(input),
      otherRepository.createUser(input),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    expect(failed?.reason).toBeInstanceOf(AuthError);
    expect(failed?.reason).toMatchObject({ code: 'email_taken' });
    expect(await base.user.count({ where: { email: duplicateEmail } })).toBe(1);
  });

  it('propaga fallos inesperados de persistencia', async () => {
    const error = new Error('storage unavailable');
    jest.spyOn(prisma.client.user, 'create').mockRejectedValueOnce(error);
    await expect(
      repository.createUser({
        email,
        displayName: 'Audit',
        passwordHash: 'synthetic-hash',
      }),
    ).rejects.toBe(error);
  });

  it('rechaza tokens desconocidos y vencidos sin crear reemplazos', async () => {
    await expect(
      repository.rotateRefreshToken(randomUUID(), replacement()),
    ).resolves.toBeNull();
    const expired = await seedSession(new Date(0));
    await expect(
      repository.rotateRefreshToken(expired.tokenHash, replacement()),
    ).resolves.toBeNull();
    expect(await base.refreshToken.count({ where: { userId } })).toBe(1);
  });

  it('confirma la revocación por reuso y conserva otras familias', async () => {
    const old = await seedSession();
    const unrelated = await seedSession();
    await expect(
      repository.rotateRefreshToken(old.tokenHash, replacement()),
    ).resolves.toEqual({ userId });
    await base.refreshToken.update({
      where: { id: old.id },
      data: { rotatedAt: new Date(Date.now() - REFRESH_GRACE_MS - 1) },
    });
    await expect(
      repository.rotateRefreshToken(old.tokenHash, replacement()),
    ).resolves.toBeNull();
    expect(
      await base.refreshToken.count({
        where: { familyId: old.familyId, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await base.refreshToken.count({
        where: { familyId: unrelated.familyId, revokedAt: null },
      }),
    ).toBe(1);
  });

  it('dos rotaciones concurrentes respetan la gracia sin cerrar la familia', async () => {
    const old = await seedSession();
    const results = await Promise.all([
      repository.rotateRefreshToken(old.tokenHash, replacement()),
      otherRepository.rotateRefreshToken(old.tokenHash, replacement()),
    ]);
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(results.filter((result) => result === null)).toHaveLength(0);
    expect(
      await base.refreshToken.count({
        where: { familyId: old.familyId, revokedAt: null },
      }),
    ).toBe(2);
  });

  it('logout espera la rotación en curso y revoca también su reemplazo', async () => {
    const old = await seedSession();
    let release!: () => void;
    let signalReady!: (pid: number) => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<number>((resolve) => {
      signalReady = resolve;
    });
    const gate = base.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${old.familyId}, 0))`;
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        signalReady(row.pid);
        await released;
      },
      { timeout: 10_000 },
    );
    const holderPid = await ready;
    const pending: Array<Promise<unknown>> = [];
    try {
      pending.push(repository.rotateRefreshToken(old.tokenHash, replacement()));
      await waitForBlockedQueries(holderPid, 1);
      pending.push(otherRepository.revokeSession(old.tokenHash));
      await waitForBlockedQueries(holderPid, 2);
    } finally {
      release();
      await gate;
      await Promise.allSettled(pending);
    }
    await expect(pending[0]).resolves.toEqual({ userId });
    await expect(pending[1]).resolves.toBeUndefined();
    expect(
      await base.refreshToken.count({
        where: { familyId: old.familyId, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('una sesión cerrada no puede volver a rotar', async () => {
    const old = await seedSession();
    await otherRepository.revokeSession(old.tokenHash);
    await expect(
      repository.rotateRefreshToken(old.tokenHash, replacement()),
    ).resolves.toBeNull();
    await expect(
      repository.revokeSession(randomUUID()),
    ).resolves.toBeUndefined();
    expect(
      await base.refreshToken.count({
        where: { familyId: old.familyId, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('revierte la revocación anterior si falla la inserción del reemplazo', async () => {
    const old = await seedSession();
    const other = await seedSession();
    await expect(
      repository.rotateRefreshToken(old.tokenHash, {
        tokenHash: other.tokenHash,
        expiresAt: replacement().expiresAt,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const unchanged = await base.refreshToken.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(unchanged.revokedAt).toBeNull();
    await expect(
      repository.rotateRefreshToken(old.tokenHash, replacement()),
    ).resolves.toEqual({ userId });
  });
});
