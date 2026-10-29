import { glicko2 } from './glicko2.js';
import { INITIAL_RATING, isProvisional } from './rating.js';
import { Glicko2System } from './rating-system.js';

describe('glicko2', () => {
  it('reproduce el ejemplo del paper de Glickman', () => {
    const player = { rating: 1500, deviation: 200, volatility: 0.06 };
    const next = glicko2(player, [
      { opponent: { rating: 1400, deviation: 30, volatility: 0.06 }, score: 1 },
      {
        opponent: { rating: 1550, deviation: 100, volatility: 0.06 },
        score: 0,
      },
      {
        opponent: { rating: 1700, deviation: 300, volatility: 0.06 },
        score: 0,
      },
    ]);
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.deviation).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.05999, 4);
  });

  it('sin partidas el rating no cambia y la incertidumbre crece, hasta el máximo', () => {
    const player = { rating: 1600, deviation: 80, volatility: 0.06 };
    const next = glicko2(player, []);
    expect(next.rating).toBe(1600);
    expect(next.deviation).toBeGreaterThan(80);
    expect(glicko2(INITIAL_RATING, []).deviation).toBe(350);
  });
});

describe('Glicko2System', () => {
  const system = new Glicko2System();

  it('el que gana sube, el que pierde baja, y los dos ganan certeza', () => {
    const { white, black } = system.rate(INITIAL_RATING, INITIAL_RATING, '1-0');
    expect(white.rating).toBeGreaterThan(1500);
    expect(black.rating).toBeLessThan(1500);
    expect(white.rating - 1500).toBeCloseTo(1500 - black.rating, 6);
    expect(white.deviation).toBeLessThan(350);
    expect(black.deviation).toBeLessThan(350);
  });

  it('tablas entre iguales no mueven el rating', () => {
    const { white, black } = system.rate(
      INITIAL_RATING,
      INITIAL_RATING,
      '1/2-1/2',
    );
    expect(white.rating).toBeCloseTo(1500, 6);
    expect(black.rating).toBeCloseTo(1500, 6);
  });

  it('ganarle a alguien mucho más fuerte vale más que ganarle a un igual', () => {
    const strong = { rating: 1900, deviation: 60, volatility: 0.06 };
    const vsStrong = system.rate(INITIAL_RATING, strong, '1-0').white.rating;
    const vsEqual = system.rate(INITIAL_RATING, INITIAL_RATING, '1-0').white
      .rating;
    expect(vsStrong).toBeGreaterThan(vsEqual);
  });

  it('el rating inicial es provisional y deja de serlo después de varias partidas', () => {
    expect(isProvisional(INITIAL_RATING)).toBe(true);
    const established = { rating: 1500, deviation: 60, volatility: 0.06 };
    let r = INITIAL_RATING;
    for (let i = 0; i < 20; i++) {
      r = system.rate(r, established, '1/2-1/2').white;
    }
    expect(isProvisional(r)).toBe(false);
  });

  it('las negras que ganan suben igual que las blancas', () => {
    const asWhite = system.rate(INITIAL_RATING, INITIAL_RATING, '1-0');
    const asBlack = system.rate(INITIAL_RATING, INITIAL_RATING, '0-1');
    expect(asBlack.black.rating).toBeCloseTo(asWhite.white.rating, 6);
  });
});
