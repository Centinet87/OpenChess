import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BASE_PRISMA } from './infrastructure/prisma.module';
import { AppController } from './app.controller';

async function controller(queryRaw: () => Promise<unknown>) {
  const app = await Test.createTestingModule({
    controllers: [AppController],
    providers: [{ provide: BASE_PRISMA, useValue: { $queryRaw: queryRaw } }],
  }).compile();
  return app.get(AppController);
}

describe('AppController', () => {
  it('health responde ok si la BD contesta', async () => {
    const app = await controller(async () => [{ '?column?': 1 }]);
    await expect(app.health()).resolves.toEqual({ status: 'ok' });
  });

  it('health responde 503 si la BD no contesta', async () => {
    const app = await controller(async () => {
      throw new Error('sin conexión');
    });
    await expect(app.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
