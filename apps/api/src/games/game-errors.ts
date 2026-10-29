import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { GameError, type GameErrorCode } from '@openchess/games';
import type { Response } from 'express';

export const GAME_ERROR_STATUS: Record<GameErrorCode, HttpStatus> = {
  INVALID_TIME_CONTROL: HttpStatus.BAD_REQUEST,
  GAME_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPONENT_NOT_MEMBER: HttpStatus.UNPROCESSABLE_ENTITY,
  CONFLICT: HttpStatus.CONFLICT,
  SAME_PLAYER: HttpStatus.BAD_REQUEST,
  NOT_A_PLAYER: HttpStatus.FORBIDDEN,
  NOT_STARTED: HttpStatus.CONFLICT,
  ALREADY_STARTED: HttpStatus.CONFLICT,
  CANNOT_ACCEPT_OWN: HttpStatus.CONFLICT,
  NOT_YOUR_TURN: HttpStatus.CONFLICT,
  ILLEGAL_MOVE: HttpStatus.UNPROCESSABLE_ENTITY,
  GAME_OVER: HttpStatus.CONFLICT,
  CANNOT_ABORT: HttpStatus.CONFLICT,
  NO_DRAW_OFFER: HttpStatus.CONFLICT,
};

@Catch(GameError)
export class GameErrorFilter implements ExceptionFilter<GameError> {
  catch(error: GameError, host: ArgumentsHost): void {
    const status = GAME_ERROR_STATUS[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, code: error.code, message: error.message });
  }
}
