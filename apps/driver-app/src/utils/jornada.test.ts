import { formatJornada, formatJornadaTitle } from './jornada';

describe('formatJornada', () => {
  it('names the weekday and the day/month, the way the header reads it', () => {
    // 2026-08-27 cae jueves (el 28 del mockup en realidad es viernes).
    expect(formatJornada(new Date(2026, 7, 27))).toBe('JUEVES 27/08');
  });

  it('pads single-digit days and months', () => {
    expect(formatJornada(new Date(2026, 0, 5))).toBe('LUNES 05/01');
  });

  it('covers every weekday, including Sunday at index zero', () => {
    expect(formatJornada(new Date(2026, 7, 30))).toBe('DOMINGO 30/08');
    expect(formatJornada(new Date(2026, 7, 29))).toBe('SABADO 29/08');
  });

  it('reads the device calendar, not UTC', () => {
    // Las 23:30 locales del 28 son el 29 en UTC: la jornada del chofer es la
    // que marca su telefono, no la del servidor.
    expect(formatJornada(new Date(2026, 7, 27, 23, 30))).toBe('JUEVES 27/08');
  });
});

describe('formatJornadaTitle', () => {
  it('reads as a sentence, not as a label', () => {
    expect(formatJornadaTitle(new Date(2026, 7, 27))).toBe('jueves 27/08');
  });

  it('uses the same calendar as the uppercase header, so both agree on the day', () => {
    const date = new Date(2026, 7, 27, 23, 30);
    expect(formatJornadaTitle(date)).toBe(formatJornada(date).toLowerCase());
  });
});
