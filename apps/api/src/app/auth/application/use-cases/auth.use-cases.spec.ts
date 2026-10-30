import { randomUUID } from 'node:crypto';
import { AuthError } from '../../domain/auth.error';
import { REFRESH_TTL_MS } from '../../domain/auth.types';
import type { AuthCrypto } from '../security/auth.crypto';
import type { AuthRepository } from '../repositories/auth.repository';
import { IssueSession } from './issue-session';
import { RegisterUseCase } from './register.use-case';
import { LoginUseCase } from './login.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { LogoutUseCase } from './logout.use-case';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import { VerifyAccessTokenUseCase } from './verify-access-token.use-case';
import { ChangePasswordUseCase } from './change-password.use-case';
import { UpdateProfileUseCase } from './update-profile.use-case';

const input = {
  email: 'ana@test.local',
  password: randomUUID(),
  displayName: 'Ana',
};
const user = { id: randomUUID(), passwordHash: 'stored-hash' };
describe('Auth use cases', () => {
  let repository: jest.Mocked<AuthRepository>;
  let crypto: jest.Mocked<AuthCrypto>;
  let register: RegisterUseCase;
  let login: LoginUseCase;
  let refresh: RefreshSessionUseCase;
  let logout: LogoutUseCase;
  let currentUser: GetCurrentUserUseCase;
  let verifyAccessToken: VerifyAccessTokenUseCase;

  beforeEach(async () => {
    repository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue(null),
      findUserCredentials: jest.fn(),
      updateDisplayName: jest.fn(),
      changePassword: jest.fn(),
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
    const issueSession = new IssueSession(repository, crypto);
    register = new RegisterUseCase(repository, crypto, issueSession);
    login = new LoginUseCase(repository, crypto, issueSession);
    refresh = new RefreshSessionUseCase(repository, crypto);
    logout = new LogoutUseCase(repository, crypto);
    currentUser = new GetCurrentUserUseCase(repository);
    verifyAccessToken = new VerifyAccessTokenUseCase(crypto);
    await login.initialize();
  });

  it('registra con contraseña hasheada y persiste solo el hash del refresh', async () => {
    const before = Date.now();
    await expect(register.execute(input)).resolves.toEqual({
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
    await expect(register.execute(input)).rejects.toMatchObject({
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
      await expect(login.execute(input)).rejects.toMatchObject({
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
    await expect(login.execute(input)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'opaque-token',
    });
  });

  it('rechaza un refresh ausente sin consultar la base', async () => {
    await expect(refresh.execute(undefined)).rejects.toBeInstanceOf(AuthError);
    expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('rechaza una rotación inválida sin emitir un access token', async () => {
    repository.rotateRefreshToken.mockResolvedValue(null);
    await expect(refresh.execute('unknown')).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
    expect(crypto.signAccessToken).not.toHaveBeenCalled();
  });

  it('delega la rotación atómica y emite la sesión del usuario devuelto', async () => {
    const before = Date.now();
    await expect(refresh.execute('old')).resolves.toEqual({
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
    await logout.execute(undefined);
    expect(repository.revokeSession).not.toHaveBeenCalled();
  });

  it('logout revoca la familia del token', async () => {
    await logout.execute('current');
    expect(repository.revokeSession).toHaveBeenCalledWith('token-hash');
  });

  it('propaga errores de persistencia sin emitir un access token', async () => {
    crypto.signAccessToken.mockClear();
    repository.rotateRefreshToken.mockRejectedValue(new Error('database'));
    await expect(refresh.execute('current')).rejects.toThrow('database');
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
    await expect(currentUser.execute(user.id)).resolves.toEqual(profile);
    await expect(currentUser.execute(user.id)).rejects.toMatchObject({
      code: 'user_not_found',
    });
  });

  it('delega la verificación del access token y propaga su rechazo', async () => {
    await expect(verifyAccessToken.execute('access')).resolves.toEqual({
      sub: user.id,
    });
    crypto.verifyAccessToken.mockRejectedValueOnce(
      new Error('invalid signature'),
    );
    await expect(verifyAccessToken.execute('invalid')).rejects.toThrow(
      'invalid signature',
    );
  });

  it('no cambia la contraseña ni emite sesión cuando la contraseña actual es incorrecta', async () => {
    repository.findUserCredentials.mockResolvedValue(user);
    crypto.verifyPassword.mockResolvedValue(false);
    const changePassword = new ChangePasswordUseCase(
      repository,
      crypto,
      new IssueSession(repository, crypto),
    );
    await expect(
      changePassword.execute(user.id, {
        currentPassword: input.password,
        newPassword: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(repository.changePassword).not.toHaveBeenCalled();
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('cambia la contraseña antes de emitir la sesión nueva y propaga un fallo de persistencia', async () => {
    repository.findUserCredentials.mockResolvedValue(user);
    repository.changePassword.mockRejectedValueOnce(new Error('database'));
    const changePassword = new ChangePasswordUseCase(
      repository,
      crypto,
      new IssueSession(repository, crypto),
    );
    const body = { currentPassword: input.password, newPassword: randomUUID() };
    await expect(changePassword.execute(user.id, body)).rejects.toThrow(
      'database',
    );
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
    await expect(changePassword.execute(user.id, body)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'opaque-token',
    });
    expect(repository.changePassword).toHaveBeenLastCalledWith(
      user.id,
      'password-hash',
    );
  });

  it('devuelve el perfil persistido después de cambiar el nombre', async () => {
    const profile = {
      id: user.id,
      email: input.email,
      displayName: 'Nuevo nombre',
      emailVerified: true,
    };
    repository.findUserById.mockResolvedValue(profile);
    const updateProfile = new UpdateProfileUseCase(repository, currentUser);
    await expect(
      updateProfile.execute(user.id, { displayName: profile.displayName }),
    ).resolves.toEqual(profile);
    expect(repository.updateDisplayName).toHaveBeenCalledWith(
      user.id,
      profile.displayName,
    );
  });
});
