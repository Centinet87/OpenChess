import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  FideUseCases,
  LinkedAccountsUseCases,
  LinkError,
  type ImportSummary,
  type Platform,
} from '@openchess/linked-accounts';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ClubMemberGuard } from '../clubs/club-member.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthGuard } from '../identity/auth.guard';
import { pkcePair, type LichessOAuth } from './lichess';
import {
  fideIdSchema,
  importSchema,
  listImportsSchema,
  oauthCallbackSchema,
  platformSchema,
  usernameSchema,
} from './linked-accounts.schemas';
import {
  toAccountView,
  toFideView,
  toGameView,
  toOwnAccountView,
  type FideView,
  type ImportedGameView,
  type LinkedAccountView,
  type OwnLinkedAccountView,
} from './linked-accounts.view';

export const LICHESS_OAUTH = Symbol('LICHESS_OAUTH');

// Cada uno pega en la plataforma externa: no más de 5 por minuto.
const EXTERNAL = { default: { limit: 5, ttl: 60_000 } };
// Un admin puede asignar el FIDE ID de toda una academia de una vez.
const FIDE_ADMIN = { default: { limit: 30, ttl: 60_000 } };

/** Vincular las cuentas propias de Lichess y Chess.com. Vale en el dominio raíz. */
@Controller('accounts')
@UseGuards(AuthGuard)
export class LinkedAccountsController {
  constructor(
    private readonly accounts: LinkedAccountsUseCases,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async list(): Promise<OwnLinkedAccountView[]> {
    const rows = await this.accounts.list(this.cls.get('userId'));
    return rows.map(toOwnAccountView);
  }

  /** Chess.com no permite iniciar sesión: devuelve un código para poner en el perfil. */
  @Post('chesscom')
  @Throttle(EXTERNAL)
  async startChessCom(
    @Body(new ZodPipe(usernameSchema)) body: { username: string },
  ): Promise<OwnLinkedAccountView> {
    return toOwnAccountView(
      await this.accounts.startVerification(
        this.cls.get('userId'),
        'chesscom',
        body.username,
      ),
    );
  }

  @Post('chesscom/verify')
  @HttpCode(200)
  @Throttle(EXTERNAL)
  async verifyChessCom(): Promise<OwnLinkedAccountView> {
    return toOwnAccountView(
      await this.accounts.verify(this.cls.get('userId'), 'chesscom'),
    );
  }

  @Post(':platform/refresh')
  @HttpCode(200)
  @Throttle(EXTERNAL)
  async refresh(
    @Param('platform', new ZodPipe(platformSchema)) platform: Platform,
  ): Promise<OwnLinkedAccountView> {
    return toOwnAccountView(
      await this.accounts.refresh(this.cls.get('userId'), platform),
    );
  }

  @Delete(':platform')
  @HttpCode(204)
  async unlink(
    @Param('platform', new ZodPipe(platformSchema)) platform: Platform,
  ): Promise<void> {
    await this.accounts.unlink(this.cls.get('userId'), platform);
  }
}

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
    private readonly accounts: LinkedAccountsUseCases,
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
      secure: this.env.NODE_ENV === 'production',
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
      await this.accounts.linkVerified(
        this.cls.get('userId'),
        'lichess',
        username,
      );
      return back({ vinculada: 'lichess' });
    } catch (error) {
      if (error instanceof LinkError) return back({ error: error.code });
      throw error;
    }
  }
}

/** Dentro de un club: cuentas de los miembros y partidas importadas. */
@Controller('club')
@UseGuards(AuthGuard, ClubMemberGuard)
export class ClubLinkedAccountsController {
  constructor(
    private readonly accounts: LinkedAccountsUseCases,
    private readonly cls: ClsService,
  ) {}

  /** Cuentas verificadas de un miembro. RLS no deja ver las de quien no es del club. */
  @Get('accounts/:userId')
  async memberAccounts(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<LinkedAccountView[]> {
    const rows = await this.accounts.verifiedOf(userId);
    return rows.map(toAccountView);
  }

  /** Trae al club mis partidas recientes de la plataforma. */
  @Post('imports')
  @Throttle(EXTERNAL)
  importGames(
    @Body(new ZodPipe(importSchema)) body: { platform: Platform },
  ): Promise<ImportSummary> {
    return this.accounts.importGames(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      body.platform,
    );
  }

  @Get('imports')
  async listImports(
    @Query(new ZodPipe(listImportsSchema)) query: { userId?: string },
  ): Promise<ImportedGameView[]> {
    const rows = await this.accounts.listImported(
      this.cls.get('clubId'),
      query.userId ?? null,
    );
    return rows.map(toGameView);
  }

  @Get('imports/:id')
  async getImport(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportedGameView & { pgn: string }> {
    const game = await this.accounts.findImported(this.cls.get('clubId'), id);
    if (!game) throw new NotFoundException('Partida no encontrada');
    return { ...toGameView(game), pgn: game.pgn };
  }
}

/**
 * Elo FIDE de los miembros. Lo asigna un admin del club (FIDE no tiene login para
 * que la persona pruebe que el FIDE ID es suyo); cualquier miembro lo puede ver.
 */
@Controller('club/fide')
@UseGuards(AuthGuard, ClubMemberGuard)
export class FideController {
  constructor(
    private readonly fide: FideUseCases,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async list(): Promise<FideView[]> {
    return (await this.fide.list(this.cls.get('clubId'))).map(toFideView);
  }

  @Get(':userId')
  async get(@Param('userId', ParseUUIDPipe) userId: string): Promise<FideView> {
    const link = await this.fide.get(this.cls.get('clubId'), userId);
    if (!link) throw new NotFoundException('Ese miembro no tiene FIDE ID');
    return toFideView(link);
  }

  @Put(':userId')
  @Throttle(FIDE_ADMIN)
  async link(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(fideIdSchema)) body: { fideId: string },
  ): Promise<FideView> {
    return toFideView(
      await this.fide.link(
        this.cls.get('clubId'),
        { userId: this.cls.get('userId'), role: this.cls.get('role') },
        userId,
        body.fideId,
      ),
    );
  }

  @Post(':userId/refresh')
  @HttpCode(200)
  @Throttle(EXTERNAL)
  async refresh(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<FideView> {
    return toFideView(await this.fide.refresh(this.cls.get('clubId'), userId));
  }

  @Delete(':userId')
  @HttpCode(204)
  async unlink(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.fide.unlink(
      this.cls.get('clubId'),
      { role: this.cls.get('role') },
      userId,
    );
  }
}
