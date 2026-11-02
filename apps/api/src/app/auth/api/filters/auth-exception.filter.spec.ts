import type { ArgumentsHost } from '@nestjs/common';
import { AccountError } from '../../domain/account.error';
import { AuthError } from '../../domain/auth.error';
import { AuthExceptionFilter } from './auth-exception.filter';

describe('AuthExceptionFilter', () => {
  it.each([
    [
      new AccountError('incorrect_password', 'Contraseña incorrecta'),
      {
        statusCode: 401,
        message: 'Contraseña incorrecta',
        error: 'Unauthorized',
      },
    ],
    [
      new AccountError('invalid_link', 'Link vencido'),
      { statusCode: 400, message: 'Link vencido', error: 'Bad Request' },
    ],
    [
      new AccountError('LAST_OWNER', 'Falta otro dueño', [
        { slug: 'club', name: 'Club' },
      ]),
      {
        statusCode: 409,
        code: 'LAST_OWNER',
        message: 'Falta otro dueño',
        clubs: [{ slug: 'club', name: 'Club' }],
      },
    ],
  ])('mantiene la respuesta HTTP de cuenta %s', (error, body) => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as ArgumentsHost;
    new AuthExceptionFilter().catch(error as AccountError, host);
    expect(response.status).toHaveBeenCalledWith(
      (body as { statusCode: number }).statusCode,
    );
    expect(response.json).toHaveBeenCalledWith(body);
  });
  it.each<[AuthError, number, string | undefined, string]>([
    [
      new AuthError('email_taken', 'Ya existe una cuenta con ese email'),
      409,
      'Conflict',
      'Ya existe una cuenta con ese email',
    ],
    [
      new AuthError('invalid_credentials', 'Email o contraseña incorrectos'),
      401,
      'Unauthorized',
      'Email o contraseña incorrectos',
    ],
    [new AuthError('invalid_session'), 401, undefined, 'Unauthorized'],
    [new AuthError('user_not_found'), 404, undefined, 'Not Found'],
  ])(
    'mantiene la respuesta HTTP de %s',
    (error, statusCode, label, message) => {
      const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const host = {
        switchToHttp: () => ({ getResponse: () => response }),
      } as ArgumentsHost;
      new AuthExceptionFilter().catch(error, host);
      expect(response.status).toHaveBeenCalledWith(statusCode);
      expect(response.json).toHaveBeenCalledWith(
        label ? { statusCode, message, error: label } : { statusCode, message },
      );
    },
  );
});
