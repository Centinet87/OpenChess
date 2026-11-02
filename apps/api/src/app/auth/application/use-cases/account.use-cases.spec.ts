import { AccountError } from '../../domain/account.error';
import type { AccountRepository } from '../repositories/account.repository';
import { AccountUseCases, DELETED_NAME } from './account.use-cases';

function setup() {
  const repository: jest.Mocked<AccountRepository> = {
    export: jest.fn(),
    passwordHash: jest.fn().mockResolvedValue('hash'),
    memberships: jest.fn().mockResolvedValue([]),
    activeGames: jest.fn().mockResolvedValue(0),
    owners: jest.fn().mockResolvedValue(1),
    members: jest.fn().mockResolvedValue(1),
    payingSubscriptions: jest.fn().mockResolvedValue(0),
    leave: jest.fn(),
    anonymize: jest.fn(),
  };
  const crypto = { verifyPassword: jest.fn().mockResolvedValue(true) };
  return {
    repository,
    crypto,
    account: new AccountUseCases(repository, crypto),
  };
}

describe('AccountUseCases', () => {
  it('una contraseña incorrecta no permite borrar ni consultar los clubes', async () => {
    const { repository, crypto, account } = setup();
    crypto.verifyPassword.mockResolvedValue(false);
    await expect(account.delete('user', 'wrong')).rejects.toMatchObject({
      code: 'incorrect_password',
    });
    expect(repository.memberships).not.toHaveBeenCalled();
    expect(repository.anonymize).not.toHaveBeenCalled();
  });

  it('revisa todos los clubes antes de borrar el primero', async () => {
    const { repository, account } = setup();
    const solo = {
      clubId: 'solo',
      role: { isOwner: true },
      club: { slug: 'solo', name: 'Solo' },
    };
    const shared = {
      clubId: 'shared',
      role: { isOwner: true },
      club: { slug: 'shared', name: 'Shared' },
    };
    repository.memberships.mockResolvedValue([solo, shared]);
    repository.members.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await expect(account.delete('user', 'password')).rejects.toMatchObject({
      code: 'LAST_OWNER',
      clubs: [shared.club],
    });
    expect(repository.leave).not.toHaveBeenCalled();
    expect(repository.anonymize).not.toHaveBeenCalled();
  });

  it('conserva el club causante si otro dueño sale al mismo tiempo', async () => {
    const { repository, account } = setup();
    const membership = {
      clubId: 'club',
      role: { isOwner: true },
      club: { slug: 'club', name: 'Club' },
    };
    repository.memberships.mockResolvedValue([membership]);
    repository.owners.mockResolvedValue(2);
    repository.leave.mockRejectedValue(new AccountError('LAST_OWNER', 'race'));
    await expect(account.delete('user', 'password')).rejects.toMatchObject({
      code: 'LAST_OWNER',
      clubs: [membership.club],
    });
    expect(repository.anonymize).not.toHaveBeenCalled();
  });

  it('anonimiza la cuenta sin dejar un email utilizable', async () => {
    const { repository, account } = setup();
    await account.delete('user', 'password');
    expect(repository.anonymize).toHaveBeenCalledWith(
      'user',
      expect.stringMatching(/^eliminada-.+@openchess\.invalid$/),
      DELETED_NAME,
    );
  });
});
