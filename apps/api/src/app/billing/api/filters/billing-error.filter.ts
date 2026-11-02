import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError } from '@openchess/contracts';
import type { Response } from 'express';
import { BillingError, type BillingErrorCode } from '../../domain/errors';

const STATUS: Record<BillingErrorCode, HttpStatus> = {
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ALREADY_SUBSCRIBED: HttpStatus.CONFLICT,
  NOT_SUBSCRIBED: HttpStatus.CONFLICT,
  BILLING_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Traduce las reglas rotas del dominio a respuestas HTTP con su código. */
@Catch(BillingError)
export class BillingErrorFilter implements ExceptionFilter<BillingError> {
  catch(error: BillingError, host: ArgumentsHost): void {
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
