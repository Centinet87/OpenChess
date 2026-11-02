import {
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccountError } from '../../domain/account.error';
import { AuthError } from '../../domain/auth.error';

const HTTP_ERRORS = {
  email_taken: ConflictException,
  invalid_credentials: UnauthorizedException,
  invalid_session: UnauthorizedException,
  user_not_found: NotFoundException,
};

@Catch(AuthError, AccountError)
export class AuthExceptionFilter implements ExceptionFilter<
  AuthError | AccountError
> {
  catch(error: AuthError | AccountError, host: ArgumentsHost): void {
    const exception =
      error instanceof AuthError
        ? new HTTP_ERRORS[error.code](error.message || undefined)
        : this.accountException(error);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }

  private accountException(error: AccountError) {
    if (error.code === 'incorrect_password')
      return new UnauthorizedException(error.message);
    if (error.code === 'invalid_link' || error.code === 'same_email')
      return new BadRequestException(error.message);
    return new ConflictException({
      statusCode: 409,
      code: error.code,
      message: error.message,
      ...(error.clubs ? { clubs: error.clubs } : {}),
    });
  }
}
