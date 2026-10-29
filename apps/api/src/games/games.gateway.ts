import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { GameError, GamesUseCases, type GameSnapshot } from '@openchess/games';
import { parse as parseCookies } from 'cookie';
import { ClsService } from 'nestjs-cls';
import type { Namespace, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthService } from '../identity/auth.service';
import { ACCESS_COOKIE } from '../identity/cookies';
import { TenantPrisma } from '../infrastructure/prisma.module';
import { GameEventsHub } from './game-events.hub';
import { toView, type GameView } from './game-view';
import { commandSchema, joinSchema, type CommandInput } from './games.schemas';

export type Ack =
  { ok: true; game: GameView } | { ok: false; code: string; message: string };

interface SocketData {
  userId: string;
  /** gameId → clubId de las partidas a las que se unió (ya validada la membresía). */
  games: Map<string, string>;
}

const room = (gameId: string) => `game:${gameId}`;

/** Acepta el dominio de la app y sus subdominios. Frena el secuestro de la sesión desde otros sitios. */
export function isAllowedOrigin(
  origin: string | undefined,
  appDomain: string,
): boolean {
  // Sin Origin no es un navegador: no puede usar las cookies de otra persona.
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === appDomain || host.endsWith(`.${appDomain}`);
  } catch {
    return false;
  }
}

/**
 * Partidas en vivo. El cliente se conecta con su cookie de sesión, se une a una
 * partida con `game:join` y juega con `game:command`. Todo cambio se reparte a
 * la sala con `game:update`. El servidor valida cada jugada y lleva el reloj.
 */
@WebSocketGateway({ namespace: '/games', maxHttpBufferSize: 10_000 })
export class GamesGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() private server!: Namespace;
  private readonly logger = new Logger(GamesGateway.name);
  private unsubscribe?: () => void;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: TenantPrisma,
    private readonly cls: ClsService,
    private readonly games: GamesUseCases,
    private readonly hub: GameEventsHub,
    @Inject(ENV) private readonly env: Env,
  ) {}

  afterInit(server: Namespace): void {
    // Origen y sesión se validan antes de aceptar la conexión: sin esto el cliente
    // recibe `connect` y puede mandar mensajes antes de que termine la verificación.
    server.use((socket, next) => {
      if (
        !isAllowedOrigin(socket.handshake.headers.origin, this.env.APP_DOMAIN)
      ) {
        return next(new Error('Origen no permitido'));
      }
      const token = parseCookies(socket.handshake.headers.cookie ?? '')[
        ACCESS_COOKIE
      ];
      if (!token) return next(new Error('Inicia sesión'));
      this.auth
        .verifyAccessToken(token)
        .then(({ sub }) => {
          const data: SocketData = { userId: sub, games: new Map() };
          socket.data = data;
          next();
        })
        .catch(() => next(new Error('Inicia sesión')));
    });
    this.unsubscribe = this.hub.subscribe((game, events) => {
      this.server.to(room(game.id)).emit('game:update', {
        game: toView(game, Date.now()),
        events,
      });
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  @SubscribeMessage('game:join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    return this.handle(
      socket,
      joinSchema,
      body,
      async ({ club, gameId }, data) => {
        const clubId = await this.memberClubId(club, data.userId);
        const game = await this.inContext(clubId, data.userId, () =>
          this.games.checkTimeout(gameId),
        );
        data.games.set(gameId, clubId);
        await socket.join(room(gameId));
        return game;
      },
    );
  }

  @SubscribeMessage('game:command')
  async command(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    return this.handle(socket, commandSchema, body, async (cmd, data) => {
      const clubId = data.games.get(cmd.gameId);
      if (!clubId)
        throw new GameError('GAME_NOT_FOUND', 'Únete a la partida primero');
      return this.inContext(clubId, data.userId, () =>
        this.run(cmd, data.userId),
      );
    });
  }

  private run(cmd: CommandInput, userId: string): Promise<GameSnapshot> {
    if (cmd.action === 'move') {
      const { from, to, promotion } = cmd;
      return this.games.move(cmd.gameId, userId, { from, to, promotion });
    }
    return this.games[cmd.action](cmd.gameId, userId);
  }

  /** Club del slug, solo si el usuario es miembro. Sin eso no se abre el contexto. */
  private async memberClubId(slug: string, userId: string): Promise<string> {
    const membership = await this.inContext(undefined, userId, () =>
      this.prisma.client.membership.findFirst({
        where: { userId, club: { slug: slug.toLowerCase() } },
        select: { clubId: true },
      }),
    );
    if (!membership)
      throw new GameError('GAME_NOT_FOUND', 'Partida no encontrada');
    return membership.clubId;
  }

  private inContext<T>(
    clubId: string | undefined,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    // El await va adentro: las consultas de Prisma recién corren al esperarlas, y
    // tienen que correr dentro de este contexto para que RLS vea al usuario y al club.
    return this.cls.run(async () => {
      this.cls.set('userId', userId);
      if (clubId) this.cls.set('clubId', clubId);
      return await fn();
    });
  }

  /** Valida el mensaje, ejecuta y responde por el ack. Los errores no tumban el socket. */
  private async handle<T>(
    socket: Socket,
    schema: ZodType<T>,
    body: unknown,
    fn: (input: T, data: SocketData) => Promise<GameSnapshot>,
  ): Promise<Ack> {
    const data = socket.data as SocketData | undefined;
    if (!data?.userId)
      return { ok: false, code: 'UNAUTHORIZED', message: 'Inicia sesión' };

    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return { ok: false, code: 'BAD_REQUEST', message: 'Mensaje inválido' };

    try {
      return {
        ok: true,
        game: toView(await fn(parsed.data, data), Date.now()),
      };
    } catch (error) {
      if (error instanceof GameError) {
        return { ok: false, code: error.code, message: error.message };
      }
      this.logger.error('Error en el gateway de partidas', error);
      return { ok: false, code: 'INTERNAL', message: 'Error interno' };
    }
  }
}
