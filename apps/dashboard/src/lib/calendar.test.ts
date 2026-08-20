import {
  buildMonthGrid,
  selectRange,
  shiftMonth,
  type RangeSelection,
} from './calendar';
import type { EffectiveDay } from './calendar';

const day = (date: string, driverId: string | null, kind: 'titular' | 'cobertura' | null): EffectiveDay => ({
  date,
  driverId,
  assignmentId: driverId ? `a-${date}` : null,
  kind,
});

describe('buildMonthGrid', () => {
  it('starts the grid on Monday, padding the days that belong to the previous month', () => {
    // Febrero 2026 arranca un domingo. Con semanas de lunes a domingo, la
    // primera fila necesita 6 celdas vacias antes del dia 1.
    const grid = buildMonthGrid(2026, 2, []);

    expect(grid[0]).toHaveLength(7);
    expect(grid[0].slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(grid[0][6]?.date).toBe('2026-02-01');
  });

  it('covers every day of the month exactly once', () => {
    const grid = buildMonthGrid(2026, 2, []);
    const dates = grid.flat().filter(Boolean).map((cell) => cell!.date);

    expect(dates).toHaveLength(28);
    expect(new Set(dates).size).toBe(28);
    expect(dates[0]).toBe('2026-02-01');
    expect(dates[27]).toBe('2026-02-28');
  });

  it('handles a 31-day month that ends mid-week without dropping the last days', () => {
    const grid = buildMonthGrid(2026, 1, []);
    const dates = grid.flat().filter(Boolean).map((cell) => cell!.date);

    expect(dates).toHaveLength(31);
    expect(dates[30]).toBe('2026-01-31');
  });

  it('handles a leap February', () => {
    const dates = buildMonthGrid(2028, 2, []).flat().filter(Boolean);

    expect(dates).toHaveLength(29);
    expect(dates[28]!.date).toBe('2028-02-29');
  });

  it('attaches the effective day to its cell, leaving uncovered days empty', () => {
    const grid = buildMonthGrid(2026, 2, [
      day('2026-02-10', 'pedro', 'cobertura'),
      day('2026-02-11', null, null),
    ]);
    const cells = grid.flat().filter(Boolean);
    const tenth = cells.find((cell) => cell!.date === '2026-02-10');
    const eleventh = cells.find((cell) => cell!.date === '2026-02-11');

    expect(tenth!.driverId).toBe('pedro');
    expect(tenth!.kind).toBe('cobertura');
    expect(eleventh!.driverId).toBeNull();
  });
});

describe('selectRange', () => {
  const empty: RangeSelection = { from: null, to: null };

  it('the first click sets the start and leaves the end open', () => {
    expect(selectRange(empty, '2026-02-10')).toEqual({ from: '2026-02-10', to: null });
  });

  it('the second click closes the range', () => {
    const started: RangeSelection = { from: '2026-02-10', to: null };

    expect(selectRange(started, '2026-02-12')).toEqual({
      from: '2026-02-10',
      to: '2026-02-12',
    });
  });

  it('clicking the same day twice makes a one-day range, which is a valid cobertura', () => {
    const started: RangeSelection = { from: '2026-02-10', to: null };

    expect(selectRange(started, '2026-02-10')).toEqual({
      from: '2026-02-10',
      to: '2026-02-10',
    });
  });

  it('a second click BEFORE the start restarts the selection instead of inverting the range', () => {
    // Invertirlo silenciosamente crearia un rango que el admin no pidio.
    // Reiniciar es lo que espera quien se equivoco de dia.
    const started: RangeSelection = { from: '2026-02-10', to: null };

    expect(selectRange(started, '2026-02-05')).toEqual({ from: '2026-02-05', to: null });
  });

  it('clicking again on a closed range starts a new one', () => {
    const closed: RangeSelection = { from: '2026-02-10', to: '2026-02-12' };

    expect(selectRange(closed, '2026-02-20')).toEqual({ from: '2026-02-20', to: null });
  });
});

describe('shiftMonth', () => {
  it('rolls over to the next year in December', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('rolls back to the previous year in January', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});
