import { randomUUID } from 'node:crypto';
import { AuthError } from '../domain/auth.error';
import { REFRESH_TTL_MS, type RefreshToken } from '../domain/auth.types';
import { AuthService } from './auth.service';
import type { AuthCrypto } from './ports/auth.crypto';
import type { AuthRepository } from './ports/auth.repository';

const input = {
  email: 'ana@test.local',
  password: randomUUID(),
  displayName: 'Ana',
};
const user = { id: randomUUID(), passwordHash: 'stored-hash' };
const stored: RefreshToken = {
  id: randomUUID(),
  userId: user.id,
  familyId: randomUUID(),
  expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  revokedAt: null,
};

describe('AuthService', () => {
  let repository: jest.Mocked<AuthRepository>;
  let crypto: jest.Mocked<AuthCrypto>;
  let auth: AuthService;

  beforeEach(async () => {
    repository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue(null),
      createUser: jest.fn().mockResolvedValue({ id: user.id }),
      findRefreshToken: jest.fn().mockResolvedValue(stored),
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
      revokeRefreshToken: jest.fn().mockResolvedValue(1),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
    };
    crypto = {
      hashPassword: jest.fn().mockResolvedValue('password-hash'),
      verifyPassword: jest.fn().mockResolvedValue(true),
      generateToken: jest.fn().mockReturnValue('opaque-token'),
      hashToken: jest.fn().mockReturnValue('token-hash'),
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      verifyAccessToken: jest.fn().mockResolvedValue({ sub: user.id }),
    };
    auth = new AuthService(repository, crypto);
    await auth.initialize();
  });

  it('registra con contraseña hasheada y persiste solo el hash del refresh', async () => {
    const before = Date.now();
    await expect(auth.register(input)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'opaque-token',
    });
    expect(repository.createUser).toHaveBeenCalledWith({
      email: input.email,
      displayName: input.displayName,
      passwordHash: 'password-hash',
    });
    const [session] = repository.createRefreshToken.mock.calls[0];
    expect(session).toMatchObject({ userId: user.id, tokenHash: 'token-hash' });
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + REFRESH_TTL_MS,
    );
    expect(crypto.signAccessToken).toHaveBeenCalledWith({ sub: user.id });
  });

  it('rechaza un email existente sin crear otra cuenta', async () => {
    repository.findUserByEmail.mockResolvedValue(user);
    await expect(auth.register(input)).rejects.toMatchObject({
      code: 'email_taken',
      message: 'Ya existe una cuenta con ese email',
    });
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it.each([null, user])(
    'rechaza credenciales inválidas para %p',
    async (account) => {
      repository.findUserByEmail.mockResolvedValue(account);
      crypto.verifyPassword.mockResolvedValue(false);
      await expect(auth.login(input)).rejects.toMatchObject({
        code: 'invalid_credentials',
        message: 'Email o contraseña incorrectos',
      });
      expect(crypto.verifyPassword).toHaveBeenCalledWith(
        account?.passwordHash ?? 'password-hash',
        input.password,
      );
      expect(repository.createRefreshToken).not.toHaveBeenCalled();
    },
  );

  it('inicia sesión con credenciales válidas', async () => {
    repository.findUserByEmail.mockResolvedValue(user);
    await expect(auth.login(input)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'opaque-token',
    });
  });

  it('rechaza un refresh ausente sin consultar la base', async () => {
    await expect(auth.refresh(undefined)).rejects.toBeInstanceOf(AuthError);
    expect(repository.findRefreshToken).not.toHaveBeenCalled();
  });

  it('rechaza un refresh desconocido', async () => {
    repository.findRefreshToken.mockResolvedValue(null);
    await expect(auth.refresh('unknown')).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('rechaza un refresh vencido sin emitir otro', async () => {
    repository.findRefreshToken.mockResolvedValue({
      ...stored,
      expiresAt: new Date(0),
    });
    await expect(auth.refresh('expired')).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(repository.revokeRefreshToken).not.toHaveBeenCalled();
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('revoca la familia si se reutiliza un refresh revocado', async () => {
    repository.findRefreshToken.mockResolvedValue({
      ...stored,
      revokedAt: new Date(),
    });
    await expect(auth.refresh('reused')).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      stored.familyId,
      expect.any(Date),
    );
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('revoca la familia si otra petición ya rotó el token', async () => {
    repository.revokeRefreshToken.mockResolvedValue(0);
    await expect(auth.refresh('old')).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      stored.familyId,
      expect.any(Date),
    );
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('rota el refresh manteniendo usuario y familia', async () => {
    await auth.refresh('old');
    expect(repository.findRefreshToken).toHaveBeenCalledWith('token-hash');
    expect(repository.revokeRefreshToken).toHaveBeenCalledWith(
      stored.id,
      expect.any(Date),
    );
    expect(repository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: stored.userId,
        familyId: stored.familyId,
        tokenHash: 'token-hash',
      }),
    );
  });

  it('logout sin token no consulta la base', async () => {
    await auth.logout(undefined);
    expect(repository.findRefreshToken).not.toHaveBeenCalled();
  });

  it('logout con un token desconocido no revoca otras familias', async () => {
    repository.findRefreshToken.mockResolvedValue(null);
    await auth.logout('unknown');
    expect(repository.revokeFamily).not.toHaveBeenCalled();
  });

  it('logout revoca la familia del token', async () => {
    await auth.logout('current');
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      stored.familyId,
      expect.any(Date),
    );
  });

  it('propaga errores de persistencia sin emitir un access token', async () => {
    crypto.signAccessToken.mockClear();
    repository.createRefreshToken.mockRejectedValue(new Error('database'));
    await expect(auth.refresh('current')).rejects.toThrow('database');
    expect(crypto.signAccessToken).not.toHaveBeenCalled();
  });

  it('devuelve el perfil y rechaza usuarios inexistentes', async () => {
    const profile = {
      id: user.id,
      email: input.email,
      displayName: input.displayName,
    };
    repository.findUserById.mockResolvedValueOnce(profile);
    await expect(auth.me(user.id)).resolves.toEqual(profile);
    await expect(auth.me(user.id)).rejects.toMatchObject({
      code: 'user_not_found',
    });
  });

  it('delega la verificación del access token y propaga su rechazo', async () => {
    await expect(auth.verifyAccessToken('access')).resolves.toEqual({
      sub: user.id,
    });
    crypto.verifyAccessToken.mockRejectedValueOnce(
      new Error('invalid signature'),
    );
    await expect(auth.verifyAccessToken('invalid')).rejects.toThrow(
      'invalid signature',
    );
  });
});
