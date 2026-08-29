import type { ExpenseRecord } from '@distribuidor/shared';
import { summarizeExpenses, todayExpensesOf } from './expenseTotals';

const build = (overrides: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: 'e1',
  createdAt: '2026-08-28T08:02:00.000Z',
  driverName: 'chofer1',
  category: 'combustible',
  amount: 45000,
  ...overrides,
});

describe('todayExpensesOf', () => {
  it('keeps only what was spent on the given day', () => {
    const expenses = [
      build({ id: 'hoy', createdAt: '2026-08-28T08:02:00.000Z' }),
      build({ id: 'ayer', createdAt: '2026-08-27T23:59:00.000Z' }),
    ];

    expect(todayExpensesOf(expenses, '2026-08-28').map((e) => e.id)).toEqual(['hoy']);
  });

  it('returns nothing rather than failing on a driver with no expenses yet', () => {
    expect(todayExpensesOf([], '2026-08-28')).toEqual([]);
  });
});

describe('summarizeExpenses', () => {
  const reference = new Date('2026-08-28T12:00:00.000Z');

  it('adds up what was spent today and counts the entries', () => {
    const expenses = [
      build({ id: 'a', amount: 45000 }),
      build({ id: 'b', amount: 2300 }),
      build({ id: 'c', amount: 9800 }),
    ];

    const summary = summarizeExpenses(expenses, reference);

    expect(summary.todayTotal).toBe(57100);
    expect(summary.todayCount).toBe(3);
  });

  it('counts how many of today entries are still missing their receipt', () => {
    const expenses = [
      build({ id: 'a', receiptRef: 'https://cdn/a.jpg' }),
      build({ id: 'b' }),
      build({ id: 'c', receiptRef: '' }),
    ];

    // Una referencia vacia es lo mismo que no tenerla: el gasto quedo sin
    // respaldo igual.
    expect(summarizeExpenses(expenses, reference).missingReceiptCount).toBe(2);
  });

  it('adds up the last seven days for the week line', () => {
    const expenses = [
      build({ id: 'hoy', createdAt: '2026-08-28T08:00:00.000Z', amount: 100 }),
      build({ id: 'hace6', createdAt: '2026-08-22T08:00:00.000Z', amount: 200 }),
      build({ id: 'hace8', createdAt: '2026-08-20T08:00:00.000Z', amount: 999 }),
    ];

    // El de hace 8 dias queda afuera: la linea dice "esta semana", no "todo".
    expect(summarizeExpenses(expenses, reference).weekTotal).toBe(300);
  });

  it('reads zeros for a driver who has not spent anything', () => {
    expect(summarizeExpenses([], reference)).toEqual({
      todayTotal: 0,
      todayCount: 0,
      missingReceiptCount: 0,
      weekTotal: 0,
    });
  });

  it('never lets yesterday leak into today total', () => {
    const expenses = [
      build({ id: 'hoy', createdAt: '2026-08-28T08:00:00.000Z', amount: 100 }),
      build({ id: 'ayer', createdAt: '2026-08-27T08:00:00.000Z', amount: 999 }),
    ];

    const summary = summarizeExpenses(expenses, reference);

    expect(summary.todayTotal).toBe(100);
    expect(summary.weekTotal).toBe(1099);
  });
});
