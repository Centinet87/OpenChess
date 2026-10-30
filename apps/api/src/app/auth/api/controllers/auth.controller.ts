import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ZodPipe } from '../../../common/zod.pipe';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import {
  LoginCommand,
  LogoutCommand,
  RefreshSessionCommand,
  RegisterCommand,
} from '../../application/commands/auth.commands';
import type {
  LoginInput,
  RegisterInput,
} from '../../application/commands/auth.commands';
import { GetCurrentUserQuery } from '../../application/queries/auth.queries';
import type { Session } from '../../domain/auth.types';
import type { UserProfile } from '../../domain/entities/user.entity';
import { AuthExceptionFilter } from '../filters/auth-exception.filter';
import { AuthGuard } from '../guards/auth.guard';
import { loginSchema, registerSchema } from '../dtos/auth.dto';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from '../cookies/session.cookies';

// Login y registro: 5 intentos por minuto por IP.
const STRICT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly cls: ClsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @Throttle(STRICT)
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const session = await this.commands.execute<RegisterCommand, Session>(
      new RegisterCommand(body),
    );
    setSessionCookies(res, session, this.env);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(STRICT)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const session = await this.commands.execute<LoginCommand, Session>(
      new LoginCommand(body),
    );
    setSessionCookies(res, session, this.env);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    try {
      setSessionCookies(
        res,
        await this.commands.execute<RefreshSessionCommand, Session>(
          new RefreshSessionCommand(req.cookies?.[REFRESH_COOKIE]),
        ),
        this.env,
      );
      return { ok: true };
    } catch (error) {
      clearSessionCookies(res, this.env);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.commands.execute<LogoutCommand, void>(
      new LogoutCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(): Promise<UserProfile> {
    return this.queries.execute<GetCurrentUserQuery, UserProfile>(
      new GetCurrentUserQuery(this.cls.get('userId')),
    );
  }
}
