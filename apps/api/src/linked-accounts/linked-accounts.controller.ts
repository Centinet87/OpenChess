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
  fideIdSchema,
  importSchema,
  listImportsSchema,
  platformSchema,
  usernameSchema,
  type FideIdInput,
  type FideView,
  type ImportedGameDetail,
  type ImportInput,
  type ImportedGameView,
  type ImportSummary,
  type LinkedAccountView,
  type OwnLinkedAccountView,
  type Platform,
  type UsernameInput,
} from '@openchess/contracts';
import {
  FideUseCases,
  LinkedAccountsUseCases,
  LinkError,
} from '@openchess/linked-accounts';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { hasPermission } from '@openchess/clubs';
import { ClubMemberGuard } from '../clubs/club-member.guard';
import { PermissionGuard, RequirePermission } from '../clubs/permission.guard';
import { perIpAndUser } from '../common/throttler.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ENV } from '../config/config.module';
import { secureCookies, type Env } from '../config/env';
import { AuthGuard } from '../identity/auth.guard';
import { pkcePair, type LichessOAuth } from './lichess';
import { oauthCallbackSchema } from './linked-accounts.schemas';
import {
  toAccountView,
  toFideView,
  toGameView,
  toOwnAccountView,
} from './linked-accounts.view';

export const LICHESS_OAUTH = Symbol('LICHESS_OAUTH');

// Cada uno pega en la plataforma externa: no más de 5 por minuto, por IP y por usuario.
const EXTERNAL = perIpAndUser(5);
// Quien gestiona FIDE puede asignar el de toda una academia de una vez.
const FIDE_ADMIN = perIpAndUser(30);

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
    @Body(new ZodPipe(usernameSchema)) body: UsernameInput,
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
@UseGuards(AuthGuard, ClubMemberGuard, PermissionGuard)
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
  @RequirePermission('IMPORT_GAMES')
  importGames(
    @Body(new ZodPipe(importSchema)) body: ImportInput,
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
  ): Promise<ImportedGameDetail> {
    const game = await this.accounts.findImported(this.cls.get('clubId'), id);
    if (!game) throw new NotFoundException('Partida no encontrada');
    return { ...toGameView(game), pgn: game.pgn };
  }
}

/**
 * Elo FIDE de los miembros. Lo asigna quien tiene el permiso MANAGE_FIDE (FIDE no
 * tiene login para que la persona pruebe que el FIDE ID es suyo); cualquier
 * miembro lo puede ver.
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
    @Body(new ZodPipe(fideIdSchema)) body: FideIdInput,
  ): Promise<FideView> {
    return toFideView(
      await this.fide.link(
        this.cls.get('clubId'),
        {
          userId: this.cls.get('userId'),
          canManage: hasPermission(this.cls.get('role'), 'MANAGE_FIDE'),
        },
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
      { canManage: hasPermission(this.cls.get('role'), 'MANAGE_FIDE') },
      userId,
    );
  }
}
