import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { parseCookie as parseCookies } from 'cookie';
import { ClsService } from 'nestjs-cls';
import type { Namespace, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import { ACCESS_COOKIE } from '../../../auth/api/cookies/session.cookies';
import { VerifyAccessTokenQuery } from '../../../auth/application/queries/auth.queries';
import type { AccessTokenPayload } from '../../../auth/domain/auth.types';
import {
  GetMembershipClubQuery,
  IsClubMemberQuery,
} from '../../../clubs/application/queries/membership.queries';
import { isAllowedOrigin } from '../../../common/origin';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import {
  AbortGameCommand,
  AcceptGameDrawCommand,
  CheckGameTimeoutCommand,
  DeclineGameDrawCommand,
  MoveGameCommand,
  OfferGameDrawCommand,
  ResignGameCommand,
} from '../../application/commands/games.commands';
import { type GameSnapshot } from '../../domain/entities/game';
import { GameError } from '../../domain/errors';
import {
  commandSchema,
  GAME_EVENTS,
  joinSchema,
  type CommandMessage,
  type GameAck,
  type GameUpdate,
} from '../dtos/games.dto';

import { GameEvents } from '../../application/events/game.events';
import { toView } from '../presenters/game-view';

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
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly cls: ClsService,
    private readonly hub: GameEvents,
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
      this.queries
        .execute<VerifyAccessTokenQuery, AccessTokenPayload>(
          new VerifyAccessTokenQuery(token),
        )
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
          this.commands.execute<CheckGameTimeoutCommand, GameSnapshot>(
            new CheckGameTimeoutCommand(gameId),
          ),
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
      return this.commands.execute<MoveGameCommand, GameSnapshot>(
        new MoveGameCommand(cmd.gameId, userId, { from, to, promotion }),
      );
    }
    switch (cmd.action) {
      case 'resign':
        return this.commands.execute(new ResignGameCommand(cmd.gameId, userId));
      case 'abort':
        return this.commands.execute(new AbortGameCommand(cmd.gameId, userId));
      case 'offerDraw':
        return this.commands.execute(
          new OfferGameDrawCommand(cmd.gameId, userId),
        );
      case 'acceptDraw':
        return this.commands.execute(
          new AcceptGameDrawCommand(cmd.gameId, userId),
        );
      case 'declineDraw':
        return this.commands.execute(
          new DeclineGameDrawCommand(cmd.gameId, userId),
        );
    }
  }

  private async isMember(clubId: string, userId: string): Promise<boolean> {
    return this.queries.execute<IsClubMemberQuery, boolean>(
      new IsClubMemberQuery(clubId, userId),
    );
  }

  /** Club del slug, solo si el usuario es miembro. Sin eso no se abre el contexto. */
  private async memberClubId(slug: string, userId: string): Promise<string> {
    const clubId = await this.inContext(undefined, userId, () =>
      this.queries.execute<GetMembershipClubQuery, string | null>(
        new GetMembershipClubQuery(slug, userId),
      ),
    );
    if (!clubId) throw new GameError('GAME_NOT_FOUND', 'Partida no encontrada');
    return clubId;
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
