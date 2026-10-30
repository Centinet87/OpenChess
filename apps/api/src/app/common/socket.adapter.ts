import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { isAllowedOrigin } from './origin';

/**
 * El front y la API están en orígenes distintos (openchess.app y
 * api.openchess.app). Socket.IO arranca con long-polling, que el navegador solo
 * deja pasar con CORS; con credenciales, para que viaje la cookie de sesión.
 * Solo para el dominio de la app y sus subdominios.
 */
export class AppSocketAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly appDomain: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: (
          origin: string | undefined,
          callback: (error: Error | null, allow?: boolean) => void,
        ) => callback(null, isAllowedOrigin(origin, this.appDomain)),
        credentials: true,
      },
    });
  }
}
