// Datos de demostración para desarrollar el front: un club con miembros y
// roles, partidas terminadas (con su ranking), una partida en curso y un
// desafío pendiente. Usa la API igual que el front (HTTP con cookies y el
// WebSocket de partidas), así que también sirve de ejemplo de cómo llamarla.
//
// Con la API levantada (npx nx serve api):
//   npx nx run api:seed-demo
// Para borrar el club y las cuentas de demostración y crearlos de nuevo:
//   npx nx run api:seed-demo --reset

import http from 'node:http';
import { config } from 'dotenv';
import pg from 'pg';
import { io } from 'socket.io-client';

config({
  path: new URL('../../../.env', import.meta.url).pathname,
  quiet: true,
});

if (process.env.NODE_ENV === 'production') {
  console.error('Esto es solo para desarrollo: NODE_ENV=production.');
  process.exit(1);
}

const API = new URL(`http://localhost:${process.env.PORT ?? 3333}`);
const DOMAIN = process.env.APP_DOMAIN ?? 'localhost';
const FRONT = new URL(process.env.PUBLIC_URL ?? 'http://localhost:3000');
const SLUG = 'demo';
const PASSWORD = 'demo-openchess';

/** Quién es quién en el club de demostración. */
const PEOPLE = {
  ana: { name: 'Ana Torres', role: 'Admin' },
  beto: { name: 'Beto Rojas', role: 'Profesor' },
  caro: { name: 'Carolina Díaz', role: 'Socio' },
  diego: { name: 'Diego Muñoz', role: 'Socio' },
  eli: { name: 'Elisa Vera', role: 'Alumno' },
  fran: { name: 'Francisco Soto', role: 'Alumno' },
  gabi: { name: 'Gabriela Paz', role: 'Alumno' },
};
const emailOf = (key) => `${key}@demo.local`;

/** Request a la API. `club` la manda desde el subdominio del club. */
function call(method, path, { cookie, club, body } = {}) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: API.hostname,
        port: API.port,
        method,
        path: `/api${path}`,
        headers: {
          ...(club ? { host: `${club}.${DOMAIN}` } : {}),
          ...(cookie ? { cookie } : {}),
          ...(data
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(data),
              }
            : {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          const json =
            raw.startsWith('{') || raw.startsWith('[') ? JSON.parse(raw) : raw;
          if (res.statusCode >= 400) {
            const error = new Error(
              `${method} ${path}: ${res.statusCode} ${json?.message ?? raw}`,
            );
            error.status = res.statusCode;
            return reject(error);
          }
          resolve({ body: json, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** La cookie de sesión (access token) que dejó la API. */
function sessionCookie(headers) {
  const line = (headers['set-cookie'] ?? []).find((c) =>
    c.startsWith('oc_at='),
  );
  return line?.split(';')[0];
}

async function reset() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(
      `--reset solo borra en una BD local, no en ${url.hostname}`,
    );
  }
  url.search = '';
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    // Primero el club (sus membresías se van en cascada) y después las cuentas.
    await db.query('DELETE FROM clubs WHERE slug = $1', [SLUG]);
    await db.query("DELETE FROM users WHERE email LIKE '%@demo.local'");
  } finally {
    await db.end();
  }
  console.log('Borré el club y las cuentas de demostración.');
}

async function register(key) {
  try {
    const res = await call('POST', '/auth/register', {
      body: {
        email: emailOf(key),
        password: PASSWORD,
        displayName: PEOPLE[key].name,
      },
    });
    const cookie = sessionCookie(res.headers);
    const me = await call('GET', '/auth/me', { cookie });
    return { key, id: me.body.id, cookie };
  } catch (error) {
    if (error.status === 409) {
      throw new Error(
        'Las cuentas de demostración ya existen. Para empezar de cero: npx nx run api:seed-demo --reset',
      );
    }
    throw error;
  }
}

async function connect(cookie) {
  const socket = io(`${API.origin}/games`, {
    transports: ['websocket'],
    extraHeaders: { cookie },
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

async function send(socket, event, payload) {
  const ack = await socket.timeout(5000).emitWithAck(event, payload);
  if (!ack.ok) throw new Error(`${event}: ${ack.code} ${ack.message}`);
  return ack.game;
}

/**
 * Juega una partida entre dos miembros: desafío, aceptación y jugadas por el
 * WebSocket. `end` dice cómo termina si no es por las jugadas: 'resign' (se
 * rinde quien tiene el turno), 'draw' (tablas de común acuerdo) u 'open' (queda
 * en curso).
 */
async function play(white, black, moves, { end, timeControl = '5+3' } = {}) {
  const club = SLUG;
  const challenge = await call('POST', '/club/games', {
    club,
    cookie: white.cookie,
    body: { opponentId: black.id, timeControl, color: 'white' },
  });
  const gameId = challenge.body.id;
  await call('POST', `/club/games/${gameId}/accept`, {
    club,
    cookie: black.cookie,
  });

  const sockets = {
    white: await connect(white.cookie),
    black: await connect(black.cookie),
  };
  try {
    for (const socket of Object.values(sockets)) {
      await send(socket, 'game:join', { club, gameId });
    }
    let game;
    for (const [i, uci] of moves.entries()) {
      const socket = i % 2 === 0 ? sockets.white : sockets.black;
      game = await send(socket, 'game:command', {
        gameId,
        action: 'move',
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
      });
    }
    const toMove = moves.length % 2 === 0 ? sockets.white : sockets.black;
    if (end === 'resign') {
      game = await send(toMove, 'game:command', { gameId, action: 'resign' });
    } else if (end === 'draw') {
      await send(sockets.white, 'game:command', {
        gameId,
        action: 'offerDraw',
      });
      game = await send(sockets.black, 'game:command', {
        gameId,
        action: 'acceptDraw',
      });
    }
    return game;
  } finally {
    for (const socket of Object.values(sockets)) socket.disconnect();
  }
}

async function main() {
  if (process.argv.includes('--reset')) await reset();

  try {
    await call('GET', '');
  } catch {
    throw new Error(
      `No encuentro la API en ${API.origin}. Levántala con: npx nx serve api`,
    );
  }

  const people = {};
  for (const key of Object.keys(PEOPLE)) people[key] = await register(key);
  const { ana } = people;

  await call('POST', '/clubs', {
    cookie: ana.cookie,
    body: { slug: SLUG, name: 'Club de Ajedrez Demo' },
  });
  const club = { club: SLUG, cookie: ana.cookie };

  // Un rango propio del club, además de los iniciales.
  await call('POST', '/club/roles', {
    ...club,
    body: {
      name: 'Socio',
      color: '#16a085',
      permissions: ['PLAY_GAMES', 'IMPORT_GAMES'],
    },
  });
  const roles = (await call('GET', '/club/roles', club)).body;
  const roleId = (name) => roles.find((r) => r.name === name).id;

  for (const [key, person] of Object.entries(PEOPLE)) {
    if (person.role === 'Admin') continue;
    const invitation = await call('POST', '/club/invitations', {
      ...club,
      body: { roleId: roleId(person.role) },
    });
    await call('POST', '/club/invitations/accept', {
      club: SLUG,
      cookie: people[key].cookie,
      body: { token: invitation.body.token },
    });
  }

  const { beto, caro, diego, eli, fran, gabi } = people;
  // Mate del pastor: ganan las blancas.
  await play(ana, beto, [
    'e2e4',
    'e7e5',
    'd1h5',
    'b8c6',
    'f1c4',
    'g8f6',
    'h5f7',
  ]);
  // Mate del loco: ganan las negras.
  await play(caro, ana, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  await play(diego, eli, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'], {
    end: 'resign',
  });
  await play(beto, caro, ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6'], {
    end: 'draw',
  });
  await play(fran, gabi, ['e2e4', 'c7c5', 'g1f3', 'd7d6'], { end: 'resign' });
  await play(eli, ana, ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3'], {
    end: 'resign',
  });
  await play(gabi, diego, ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5', 'c7c5'], {
    end: 'draw',
  });
  // En curso: con 180 minutos dura toda la tarde de trabajo en el front.
  await play(ana, diego, ['e2e4', 'c7c5', 'g1f3'], {
    end: 'open',
    timeControl: '180+0',
  });
  // Un desafío sin aceptar.
  await call('POST', '/club/games', {
    club: SLUG,
    cookie: gabi.cookie,
    body: { opponentId: beto.id, timeControl: '10+5', color: 'random' },
  });

  // El ranking se calcula al terminar cada partida, en segundo plano.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const standings = (await call('GET', '/club/ratings', club)).body;

  const site = new URL(FRONT);
  site.hostname = `${SLUG}.${site.hostname}`;
  console.log(`\nListo: ${site.origin}`);
  console.log(`Cuentas: <nombre>@demo.local con la contraseña ${PASSWORD}`);
  for (const [key, person] of Object.entries(PEOPLE)) {
    console.log(`  ${emailOf(key).padEnd(18)} ${person.role}`);
  }
  console.log('\nRanking:');
  for (const s of standings) {
    console.log(
      `  ${String(s.position).padStart(2)}. ${s.displayName.padEnd(16)} ${s.rating}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
