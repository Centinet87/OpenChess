import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { perIpAndUser } from '../../../common/throttler.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { AuthGuard } from '../guards/auth.guard';
import {
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type TokenInput,
  type UpdateProfileInput,
  updateProfileSchema,
  type AccountExport,
  type Profile,
} from '@openchess/contracts';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  RegisterCommand,
  LoginCommand,
  RefreshSessionCommand,
  LogoutCommand,
  UpdateProfileCommand,
  ChangePasswordCommand,
  QueueVerificationCommand,
  VerifyEmailCommand,
  RequestPasswordResetCommand,
  ResetPasswordCommand,
  RequestEmailChangeCommand,
  ConfirmEmailChangeCommand,
  DeleteAccountCommand,
} from '../../application/commands/auth.commands';
import {
  GetCurrentUserQuery,
  ExportAccountQuery,
} from '../../application/queries/auth.queries';
import type { Registration, Session } from '../../domain/auth.types';
import { AuthError } from '../../domain/auth.error';
import { AuthExceptionFilter } from '../filters/auth-exception.filter';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from '../cookies/session.cookies';

// Login y registro: 5 intentos por minuto por IP y email, y por usuario si hay
// sesión (ver AppThrottlerGuard).
const STRICT = perIpAndUser(5);
// Descargar los datos o eliminar la cuenta: piden sesión (y la contraseña, al eliminar).
const ACCOUNT = perIpAndUser(10);

/** cookie-parser convierte en objeto una cookie que empieza con "j:": solo sirve un string. */
function refreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

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
    const { session } = await this.commands.execute<
      RegisterCommand,
      Registration
    >(new RegisterCommand(body));
    setSessionCookies(res, session, this.env);
    return { ok: true };
  }

  /** El link del email de verificación lleva aquí (desde la página /verificar del front). */
  @Post('verify-email')
  @HttpCode(204)
  @Throttle(STRICT)
  async verifyEmail(
    @Body(new ZodPipe(tokenSchema)) body: TokenInput,
  ): Promise<void> {
    await this.commands.execute<VerifyEmailCommand, void>(
      new VerifyEmailCommand(body.token),
    );
  }

  @Post('verification-email')
  @HttpCode(204)
  @Throttle(STRICT)
  @UseGuards(AuthGuard)
  resendVerification(): Promise<void> {
    return this.commands.execute<QueueVerificationCommand, void>(
      new QueueVerificationCommand(this.cls.get('userId')),
    );
  }

  /** Responde 204 exista o no la cuenta. */
  @Post('forgot-password')
  @HttpCode(204)
  @Throttle(STRICT)
  forgotPassword(
    @Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<void> {
    return this.commands.execute<RequestPasswordResetCommand, void>(
      new RequestPasswordResetCommand(body.email),
    );
  }

  /** Cambia la contraseña con el link del email y cierra todas las sesiones. */
  @Post('reset-password')
  @HttpCode(204)
  @Throttle(STRICT)
  async resetPassword(
    @Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    await this.commands.execute<ResetPasswordCommand, void>(
      new ResetPasswordCommand(body.token, body.password),
    );
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(STRICT)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    setSessionCookies(
      res,
      await this.commands.execute<LoginCommand, Session>(
        new LoginCommand(body),
      ),
      this.env,
    );
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
          new RefreshSessionCommand(refreshCookie(req)),
        ),
        this.env,
      );
      return { ok: true };
    } catch (error) {
      // Solo si la sesión ya no sirve: ante una caída de la BD el usuario sigue logueado.
      if (
        error instanceof UnauthorizedException ||
        (error instanceof AuthError && error.code === 'invalid_session')
      )
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
      new LogoutCommand(refreshCookie(req)),
    );
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(): Promise<Profile> {
    return this.queries.execute<GetCurrentUserQuery, Profile>(
      new GetCurrentUserQuery(this.cls.get('userId')),
    );
  }

  /** Cambia el nombre visible. */
  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<Profile> {
    return this.commands.execute<UpdateProfileCommand, Profile>(
      new UpdateProfileCommand(this.cls.get('userId'), body),
    );
  }

  /** Cambia la contraseña con la actual; las demás sesiones se cierran. */
  @Post('change-password')
  @HttpCode(204)
  @Throttle(STRICT)
  @UseGuards(AuthGuard)
  async changePassword(
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const userId = this.cls.get('userId');
    setSessionCookies(
      res,
      await this.commands.execute<ChangePasswordCommand, Session>(
        new ChangePasswordCommand(userId, body),
      ),
      this.env,
    );
  }

  /** Manda un link al email nuevo; la cuenta lo usa recién al confirmarlo. */
  @Post('change-email')
  @HttpCode(204)
  @Throttle(STRICT)
  @UseGuards(AuthGuard)
  async changeEmail(
    @Body(new ZodPipe(changeEmailSchema)) body: ChangeEmailInput,
  ): Promise<void> {
    await this.commands.execute<RequestEmailChangeCommand, void>(
      new RequestEmailChangeCommand(
        this.cls.get('userId'),
        body.password,
        body.newEmail,
      ),
    );
  }

  /** El link del email nuevo lleva aquí (desde la página /cambiar-email del front). */
  @Post('confirm-email-change')
  @HttpCode(204)
  @Throttle(STRICT)
  async confirmEmailChange(
    @Body(new ZodPipe(tokenSchema)) body: TokenInput,
  ): Promise<void> {
    await this.commands.execute<ConfirmEmailChangeCommand, void>(
      new ConfirmEmailChangeCommand(body.token),
    );
  }

  /** Todos los datos de la persona en JSON (acceso y portabilidad). */
  @Get('account/export')
  @Throttle(ACCOUNT)
  @UseGuards(AuthGuard)
  @Header('Content-Disposition', 'attachment; filename="openchess-datos.json"')
  @Header('Cache-Control', 'no-store')
  exportAccount(): Promise<AccountExport> {
    return this.queries.execute<ExportAccountQuery, AccountExport>(
      new ExportAccountQuery(this.cls.get('userId')),
    );
  }

  /** Elimina la cuenta (pide la contraseña) y cierra la sesión. */
  @Delete('account')
  @HttpCode(204)
  @Throttle(ACCOUNT)
  @UseGuards(AuthGuard)
  async deleteAccount(
    @Body(new ZodPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.commands.execute<DeleteAccountCommand, void>(
      new DeleteAccountCommand(this.cls.get('userId'), body.password),
    );
    clearSessionCookies(res, this.env);
  }
}
