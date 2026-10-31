import { GameError } from '../errors';
import { Clock } from './clock';
import { parseTimeControl, timeControl } from './time-control';

describe('controles de tiempo', () => {
  it('Fischer suma el incremento completo', () => {
    const tc = timeControl(3, 2);
    expect(tc.afterMove(60_000, 1_000)).toBe(61_000);
  });

  it('Bronstein devuelve lo gastado, hasta el incremento', () => {
    const tc = timeControl(3, 2, 'bronstein');
    expect(tc.afterMove(60_000, 1_000)).toBe(60_000);
    expect(tc.afterMove(60_000, 5_000)).toBe(57_000);
  });

  it('lee "5+3" y rechaza valores fuera de rango', () => {
    expect(parseTimeControl('5+3')).toMatchObject({
      initialMs: 300_000,
      incrementMs: 3_000,
    });
    for (const bad of ['5', '0+0', '500+0', '5+90', 'a+b']) {
      expect(() => parseTimeControl(bad)).toThrow(GameError);
    }
  });
});

describe('Clock', () => {
  const tc = timeControl(1, 0);

  it('descuenta solo al color que corre', () => {
    const clock = Clock.initial(tc).start('black', 0);
    expect(clock.remaining('black', 10_000)).toBe(50_000);
    expect(clock.remaining('white', 10_000)).toBe(60_000);
  });

  it('press descuenta lo gastado y pasa el turno', () => {
    const clock = Clock.initial(tc).start('black', 0).press('black', 15_000);
    expect(clock.state).toMatchObject({
      blackMs: 45_000,
      running: 'white',
      since: 15_000,
    });
  });

  it('marca la bandera al llegar a cero y nunca da negativo', () => {
    const clock = Clock.initial(tc).start('black', 0);
    expect(clock.flagged(59_999)).toBeNull();
    expect(clock.flagged(60_000)).toBe('black');
    expect(clock.remaining('black', 90_000)).toBe(0);
  });

  it('stop congela los tiempos', () => {
    const clock = Clock.initial(tc).start('black', 0).stop(20_000);
    expect(clock.state).toEqual({
      whiteMs: 60_000,
      blackMs: 40_000,
      running: null,
      since: null,
    });
  });
});
