import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  commandSchema,
  GAME_EVENTS,
  joinSchema,
  type CommandMessage,
  type GameAck,
  type GameUpdate,
} from '@openchess/contracts';
import { GameError, GamesUseCases, type GameSnapshot } from '@openchess/games';
import { parse as parseCookies } from 'cookie';
import { ClsService } from 'nestjs-cls';
import type { Namespace, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthService } from '../identity/auth.service';
import { isAllowedOrigin } from '../common/origin';
import { ACCESS_COOKIE } from '../identity/cookies';
import { TenantPrisma } from '../infrastructure/prisma.module';
import { GameEventsHub } from './game-events.hub';
import { toView } from './game-view';

interface SocketData {
  userId: string;
  /** gameId → clubId de las partidas a las que se unió (ya validada la membresía). */
  games: Map<string, string>;
  /** Cuándo vence la sesión con que se conectó (ms). Ahí se corta el socket. */
  expiresAt: number;
  /** Ventana del límite de mensajes. */
  window: { start: number; count: number };
}

const room = (gameId: string) => `game:${gameId}`;

/** Mensajes por conexión: una partida rápida no llega ni cerca; un script que spamea, sí. */
export const MESSAGE_LIMIT = 30;
export const MESSAGE_WINDOW_MS = 10_000;

/** Cuenta un mensaje en la ventana. Devuelve false si se pasó del límite. */
export function allowMessage(
  window: { start: number; count: number },
  now: number,
): boolean {
  if (now - window.start >= MESSAGE_WINDOW_MS) {
    window.start = now;
    window.count = 0;
  }
  window.count++;
  return window.count <= MESSAGE_LIMIT;
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
        .then(({ sub, exp }) => {
          const now = Date.now();
          const expiresAt = (exp ?? 0) * 1000;
          const data: SocketData = {
            userId: sub,
            games: new Map(),
            expiresAt,
            window: { start: now, count: 0 },
          };
          socket.data = data;
          // La sesión vale lo mismo que en HTTP: al vencer, el cliente se
          // reconecta con la cookie renovada y vuelve a pasar por aquí.
          const timer = setTimeout(
            () => socket.disconnect(true),
            Math.max(expiresAt - now, 0),
          );
          timer.unref();
          socket.once('disconnect', () => clearTimeout(timer));
          next();
        })
        .catch(() => next(new Error('Inicia sesión')));
    });
    this.unsubscribe = this.hub.subscribe((game, events) => {
      const update: GameUpdate = { game: toView(game, Date.now()), events };
      this.server.to(room(game.id)).emit(GAME_EVENTS.update, update);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  @SubscribeMessage(GAME_EVENTS.join)
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<GameAck> {
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

  @SubscribeMessage(GAME_EVENTS.command)
  async command(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<GameAck> {
    return this.handle(socket, commandSchema, body, async (cmd, data) => {
      const clubId = data.games.get(cmd.gameId);
      if (!clubId)
        throw new GameError('GAME_NOT_FOUND', 'Únete a la partida primero');
      return this.inContext(clubId, data.userId, async () => {
        // La membresía se vuelve a mirar en cada jugada: a quien sacan del club
        // no le sirve el socket que ya tenía abierto.
        if (!(await this.isMember(clubId, data.userId))) {
          data.games.delete(cmd.gameId);
          await socket.leave(room(cmd.gameId));
          throw new GameError('GAME_NOT_FOUND', 'Ya no eres miembro del club');
        }
        return this.run(cmd, data.userId);
      });
    });
  }

  private run(cmd: CommandMessage, userId: string): Promise<GameSnapshot> {
    if (cmd.action === 'move') {
      const { from, to, promotion } = cmd;
      return this.games.move(cmd.gameId, userId, { from, to, promotion });
    }
    return this.games[cmd.action](cmd.gameId, userId);
  }

  private async isMember(clubId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.client.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { id: true },
    });
    return membership !== null;
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
  ): Promise<GameAck> {
    const data = socket.data as SocketData | undefined;
    if (!data?.userId)
      return { ok: false, code: 'UNAUTHORIZED', message: 'Inicia sesión' };
    const now = Date.now();
    if (now >= data.expiresAt) {
      socket.disconnect(true);
      return { ok: false, code: 'UNAUTHORIZED', message: 'Tu sesión venció' };
    }
    if (!allowMessage(data.window, now)) {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Demasiados mensajes: espera unos segundos',
      };
    }

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
