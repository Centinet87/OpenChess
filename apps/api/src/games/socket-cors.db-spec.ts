import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';

config({ path: '../../.env', quiet: true });

let app: NestExpressApplication;
let url: string;

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.listen(0);
  url = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

/** El primer paso de Socket.IO en el navegador: long-polling, sujeto a CORS. */
function handshake(origin: string) {
  return request(url)
    .get('/socket.io/?EIO=4&transport=polling')
    .set('Origin', origin);
}

describe('Socket.IO desde el navegador', () => {
  it('el front (otro origen del mismo dominio) puede conectarse con su cookie', async () => {
    const origin = 'http://miclub.localhost:3000';
    const res = await handshake(origin).expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('otro sitio no recibe permiso de CORS', async () => {
    const res = await handshake('https://otro-sitio.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
