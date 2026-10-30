import { randomUUID } from 'node:crypto';
import { AuthError } from '../domain/auth.error';
import { REFRESH_TTL_MS } from '../domain/auth.types';
import { AuthService } from './auth.service';
import type { AuthCrypto } from './ports/auth.crypto';
import type { AuthRepository } from './ports/auth.repository';

const input = {
  email: 'ana@test.local',
  password: randomUUID(),
  displayName: 'Ana',
};
const user = { id: randomUUID(), passwordHash: 'stored-hash' };
describe('AuthService', () => {
  let repository: jest.Mocked<AuthRepository>;
  let crypto: jest.Mocked<AuthCrypto>;
  let auth: AuthService;

  beforeEach(async () => {
    repository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue(null),
      findUserCredentials: jest.fn().mockResolvedValue(user),
      updateDisplayName: jest.fn().mockResolvedValue(undefined),
      changePassword: jest.fn().mockResolvedValue(undefined),
      createUser: jest.fn().mockResolvedValue({ id: user.id }),
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
      rotateRefreshToken: jest.fn().mockResolvedValue({ userId: user.id }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
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
      session: { accessToken: 'access-token', refreshToken: 'opaque-token' },
      userId: user.id,
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
    expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('rechaza una rotación inválida sin emitir un access token', async () => {
    repository.rotateRefreshToken.mockResolvedValue(null);
    await expect(auth.refresh('unknown')).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
    expect(crypto.signAccessToken).not.toHaveBeenCalled();
  });

  it('delega la rotación atómica y emite la sesión del usuario devuelto', async () => {
    const before = Date.now();
    await expect(auth.refresh('old')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'opaque-token',
    });
    expect(repository.rotateRefreshToken).toHaveBeenCalledWith('token-hash', {
      tokenHash: 'token-hash',
      expiresAt: expect.any(Date),
    });
    const [, replacement] = repository.rotateRefreshToken.mock.calls[0];
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + REFRESH_TTL_MS,
    );
    expect(crypto.signAccessToken).toHaveBeenCalledWith({ sub: user.id });
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('logout sin token no consulta la base', async () => {
    await auth.logout(undefined);
    expect(repository.revokeSession).not.toHaveBeenCalled();
  });

  it('logout revoca la familia del token', async () => {
    await auth.logout('current');
    expect(repository.revokeSession).toHaveBeenCalledWith('token-hash');
  });

  it('propaga errores de persistencia sin emitir un access token', async () => {
    crypto.signAccessToken.mockClear();
    repository.rotateRefreshToken.mockRejectedValue(new Error('database'));
    await expect(auth.refresh('current')).rejects.toThrow('database');
    expect(crypto.signAccessToken).not.toHaveBeenCalled();
  });

  it('devuelve el perfil y rechaza usuarios inexistentes', async () => {
    const profile = {
      id: user.id,
      email: input.email,
      displayName: input.displayName,
      emailVerified: false,
    };
    repository.findUserById.mockResolvedValueOnce(profile);
    await expect(auth.profile(user.id)).resolves.toEqual(profile);
    await expect(auth.profile(user.id)).rejects.toMatchObject({
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
