import {
  Catch,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../domain/auth.error';

const HTTP_ERRORS = {
  email_taken: ConflictException,
  invalid_credentials: UnauthorizedException,
  invalid_session: UnauthorizedException,
  user_not_found: NotFoundException,
};

@Catch(AuthError)
export class AuthExceptionFilter implements ExceptionFilter<AuthError> {
  catch(error: AuthError, host: ArgumentsHost): void {
    const exception = new HTTP_ERRORS[error.code](error.message || undefined);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }
}
