import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError } from '@openchess/contracts';
import type { Response } from 'express';
import { ClubError, type ClubErrorCode } from '../../domain/errors';

const STATUS: Record<ClubErrorCode, HttpStatus> = {
  INVALID_SLUG: HttpStatus.BAD_REQUEST,
  INVALID_NAME: HttpStatus.BAD_REQUEST,
  SLUG_TAKEN: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  MEMBER_NOT_FOUND: HttpStatus.NOT_FOUND,
  LAST_OWNER: HttpStatus.CONFLICT,
  ALREADY_MEMBER: HttpStatus.CONFLICT,
  INVITATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVITATION_EXPIRED: HttpStatus.GONE,
  INVITATION_USED: HttpStatus.CONFLICT,
  ROLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_ROLE: HttpStatus.BAD_REQUEST,
  ROLE_IN_USE: HttpStatus.CONFLICT,
  MEMBER_LIMIT: HttpStatus.PAYMENT_REQUIRED,
};

/** Traduce las reglas rotas del dominio a respuestas HTTP con su código. */
@Catch(ClubError)
export class ClubErrorFilter implements ExceptionFilter<ClubError> {
  catch(error: ClubError, host: ArgumentsHost): void {
    const status = STATUS[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        code: error.code,
        message: error.message,
      } satisfies ApiError);
  }
}
