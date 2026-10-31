import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError } from '@openchess/contracts';
import type { Response } from 'express';
import { LinkError, type LinkErrorCode } from '../../domain/errors';

const STATUS: Record<LinkErrorCode, HttpStatus> = {
  INVALID_USERNAME: HttpStatus.BAD_REQUEST,
  ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  ALREADY_LINKED: HttpStatus.CONFLICT,
  NOT_PENDING: HttpStatus.CONFLICT,
  CODE_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_LINKED: HttpStatus.CONFLICT,
  PLATFORM_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_MEMBER: HttpStatus.NOT_FOUND,
  INVALID_FIDE_ID: HttpStatus.BAD_REQUEST,
};

/** Traduce las reglas rotas del dominio a respuestas HTTP con su código. */
@Catch(LinkError)
export class LinkErrorFilter implements ExceptionFilter<LinkError> {
  catch(error: LinkError, host: ArgumentsHost): void {
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
