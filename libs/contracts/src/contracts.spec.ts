import {
  challengeSchema,
  commandSchema,
  listGamesSchema,
  registerSchema,
} from './index.js';

describe('contratos', () => {
  it('una jugada lleva casillas válidas y la promoción es opcional', () => {
    const gameId = '7a1c9a62-4d7e-4a43-9d3b-6c3e0f5f4a10';
    expect(
      commandSchema.safeParse({ gameId, action: 'move', from: 'e2', to: 'e4' })
        .success,
    ).toBe(true);
    expect(
      commandSchema.safeParse({ gameId, action: 'move', from: 'e9', to: 'e4' })
        .success,
    ).toBe(false);
    expect(commandSchema.safeParse({ gameId, action: 'resign' }).success).toBe(
      true,
    );
    expect(commandSchema.safeParse({ gameId, action: 'undo' }).success).toBe(
      false,
    );
  });

  it('un desafío sin color sale al azar, y el listado parte con los abiertos', () => {
    expect(
      challengeSchema.parse({
        opponentId: '7a1c9a62-4d7e-4a43-9d3b-6c3e0f5f4a10',
        timeControl: '5+3',
      }).color,
    ).toBe('random');
    expect(listGamesSchema.parse({}).status).toEqual([
      'pending',
      'in_progress',
    ]);
    expect(listGamesSchema.safeParse({ status: 'jugando' }).success).toBe(
      false,
    );
  });

  it('el registro normaliza el email y el nombre', () => {
    expect(
      registerSchema.parse({
        email: '  Ana@Club.CL ',
        password: 'una-contraseña-larga',
        displayName: '  Ana ',
      }),
    ).toMatchObject({ email: 'ana@club.cl', displayName: 'Ana' });
    expect(
      registerSchema.safeParse({
        email: 'ana@club.cl',
        password: 'corta',
        displayName: 'Ana',
      }).success,
    ).toBe(false);
  });
});
