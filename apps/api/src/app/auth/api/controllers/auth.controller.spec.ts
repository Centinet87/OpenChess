import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ClsModule } from 'nestjs-cls';
import request from 'supertest';
import { configureApp } from '../../../configure-app';
import { ENV } from '../../../config/config.module';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  RegisterCommand,
  LoginCommand,
  RefreshSessionCommand,
  LogoutCommand,
} from '../../application/commands/auth.commands';
import {
  GetCurrentUserQuery,
  VerifyAccessTokenQuery,
} from '../../application/queries/auth.queries';
import { AuthError } from '../../domain/auth.error';
import { AuthController } from './auth.controller';
import { AuthGuard } from '../guards/auth.guard';
import { AuthExceptionFilter } from '../filters/auth-exception.filter';

const profile = {
  id: randomUUID(),
  email: 'ana@test.local',
  displayName: 'Ana',
  emailVerified: false,
};
const password = randomUUID();
const session = { accessToken: 'test-access', refreshToken: 'test-refresh' };
const auth = {
  register: jest.fn().mockResolvedValue({ session, userId: profile.id }),
  login: jest.fn().mockResolvedValue(session),
  refresh: jest.fn().mockResolvedValue(session),
  logout: jest.fn().mockResolvedValue(undefined),
  profile: jest.fn().mockResolvedValue(profile),
  verifyAccessToken: jest.fn().mockResolvedValue({ sub: profile.id }),
};

describe('Auth HTTP', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({ global: true, middleware: { mount: true } }),
      ],
      controllers: [AuthController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: (
              command:
                | RegisterCommand
                | LoginCommand
                | RefreshSessionCommand
                | LogoutCommand,
            ) => {
              if (command instanceof RegisterCommand)
                return auth.register(command.input);
              if (command instanceof LoginCommand)
                return auth.login(command.input);
              if (command instanceof RefreshSessionCommand)
                return auth.refresh(command.refreshToken);
              return auth.logout(command.refreshToken);
            },
          },
        },
        {
          provide: QueryBus,
          useValue: {
            execute: (query: GetCurrentUserQuery | VerifyAccessTokenQuery) =>
              query instanceof GetCurrentUserQuery
                ? auth.profile(query.userId)
                : auth.verifyAccessToken(query.accessToken),
          },
        },
        {
          provide: ENV,
          useValue: {
            NODE_ENV: 'test',
            PUBLIC_URL: 'http://localhost:3000',
            TRUST_PROXY: 1,
            APP_DOMAIN: 'localhost',
          },
        },
        AuthGuard,
        AuthExceptionFilter,
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('normaliza el registro y mantiene las cookies y el estado 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: ' ANA@test.local ', password, displayName: ' Ana ' })
      .expect(201, { ok: true });
    expect(auth.register).toHaveBeenCalledWith({
      email: profile.email,
      displayName: profile.displayName,
      password,
    });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(
      '\n',
    );
    expect(cookies).toMatch(/oc_at=test-access;.*HttpOnly/);
    expect(cookies).toMatch(/oc_rt=test-refresh;.*Path=\/api\/auth;.*HttpOnly/);
  });

  it('rechaza entradas inválidas antes de llamar a la aplicación', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: profile.email,
        password: password.slice(0, 5),
        displayName: 'Ana',
      })
      .expect(400);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('mantiene el 409 y su mensaje al registrar un email existente', async () => {
    auth.register.mockRejectedValueOnce(
      new AuthError('email_taken', 'Ya existe una cuenta con ese email'),
    );
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: profile.email, password, displayName: 'Ana' })
      .expect(409, {
        statusCode: 409,
        message: 'Ya existe una cuenta con ese email',
        error: 'Conflict',
      });
  });

  it('mantiene el login y su normalización', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: profile.email.toUpperCase(), password })
      .expect(200, { ok: true });
    expect(auth.login).toHaveBeenCalledWith({ email: profile.email, password });
  });

  it('borra las cookies cuando se rechaza el refresh', async () => {
    auth.refresh.mockRejectedValueOnce(new AuthError('invalid_session'));
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'oc_rt=old-refresh')
      .expect(401);
    expect(auth.refresh).toHaveBeenCalledWith('old-refresh');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^oc_at=;.*Expires=/),
        expect.stringMatching(/^oc_rt=;.*Path=\/api\/auth;.*Expires=/),
      ]),
    );
  });

  it('mantiene el logout en 204', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', 'oc_rt=current-refresh')
      .expect(204);
    expect(auth.logout).toHaveBeenCalledWith('current-refresh');
  });

  it('conserva las cookies si el refresh falla por persistencia', async () => {
    auth.refresh.mockRejectedValueOnce(new Error('database'));
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'oc_rt=current-refresh')
      .expect(500);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('distingue un token vencido de un fallo interno al verificar la sesión', async () => {
    auth.verifyAccessToken.mockRejectedValueOnce(
      Object.assign(new Error('expired'), { name: 'TokenExpiredError' }),
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'oc_at=expired')
      .expect(401);
    auth.verifyAccessToken.mockRejectedValueOnce(
      new Error('verification unavailable'),
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'oc_at=current')
      .expect(500);
  });

  it('protege /me y pasa el usuario autenticado a la aplicación', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    expect(auth.profile).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'oc_at=test-access')
      .expect(200, profile);
    expect(auth.verifyAccessToken).toHaveBeenCalledWith('test-access');
    expect(auth.profile).toHaveBeenCalledWith(profile.id);
  });
});
