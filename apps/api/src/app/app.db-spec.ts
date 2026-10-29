import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

config({ path: '../../.env', quiet: true });

let app: NestExpressApplication;

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

it('el chequeo de salud llega a la BD y no anuncia el framework', async () => {
  const res = await request(app.getHttpServer()).get('/api/health').expect(200);
  expect(res.body).toEqual({ status: 'ok' });
  expect(res.headers['x-powered-by']).toBeUndefined();
});
