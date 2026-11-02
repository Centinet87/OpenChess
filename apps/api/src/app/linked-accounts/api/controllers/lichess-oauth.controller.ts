import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { randomBytes } from 'node:crypto';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { perIpAndUser } from '../../../common/throttler.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import { ENV } from '../../../config/config.module';
import { secureCookies, type Env } from '../../../config/env';
import { LinkVerifiedAccountCommand } from '../../application/commands/linked-accounts.commands';
import {
  LICHESS_OAUTH,
  type LichessOAuth,
} from '../../application/repositories/lichess-oauth';
import { pkcePair } from '../../application/security/pkce';
import type { LinkedAccountSnapshot } from '../../domain/entities/linked-account';
import { LinkError } from '../../domain/errors';
import { oauthCallbackSchema } from '../dtos/linked-accounts.schemas';

// Cada uno pega en la plataforma externa: no más de 5 por minuto, por IP y por usuario.
const EXTERNAL = perIpAndUser(5);

/** Cookie con el state y el verifier de PKCE, mientras la persona está en Lichess. */
const OAUTH_COOKIE = 'oc_lichess';

const OAUTH_PATH = '/api/accounts/lichess';

const OAUTH_TTL_MS = 10 * 60 * 1000;

/**
 * Vincular Lichess iniciando sesión allá (OAuth con PKCE). Solo se lee el
 * usuario: el token se revoca enseguida.
 */
@Controller('accounts/lichess')
@UseGuards(AuthGuard)
export class LichessOAuthController {
  constructor(
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
    @Inject(LICHESS_OAUTH) private readonly lichess: LichessOAuth,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('connect')
  connect(@Res() res: Response): void {
    const state = randomBytes(16).toString('base64url');
    const { verifier, challenge } = pkcePair();
    res.cookie(OAUTH_COOKIE, `${state}.${verifier}`, {
      httpOnly: true,
      secure: secureCookies(this.env),
      sameSite: 'lax',
      path: OAUTH_PATH,
      maxAge: OAUTH_TTL_MS,
    });
    res.redirect(this.lichess.authorizeUrl(state, challenge));
  }

  /** Lichess vuelve aquí. Termina siempre en el front, con el resultado en la URL. */
  @Get('callback')
  @Throttle(EXTERNAL)
  async callback(
    @Query(new ZodPipe(oauthCallbackSchema))
    query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookie: unknown = req.cookies?.[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_PATH });
    const back = (params: Record<string, string>) =>
      res.redirect(
        `${this.env.PUBLIC_URL}/cuenta?${new URLSearchParams(params)}`,
      );

    const [state, verifier] =
      typeof cookie === 'string' ? cookie.split('.') : [];
    if (query.error) return back({ error: 'CANCELLED' });
    // El state impide que otro sitio nos haga vincular su cuenta (CSRF).
    if (!query.code || !state || !verifier || query.state !== state) {
      return back({ error: 'INVALID_STATE' });
    }

    try {
      const username = await this.lichess.usernameFromCode(
        query.code,
        verifier,
      );
      if (!username) return back({ error: 'INVALID_STATE' });
      await this.commands.execute<
        LinkVerifiedAccountCommand,
        LinkedAccountSnapshot
      >(
        new LinkVerifiedAccountCommand(
          this.cls.get('userId'),
          'lichess',
          username,
        ),
      );
      return back({ vinculada: 'lichess' });
    } catch (error) {
      if (error instanceof LinkError) return back({ error: error.code });
      throw error;
    }
  }
}
