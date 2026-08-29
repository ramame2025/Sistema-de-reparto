import type { ExpenseRecord } from '@distribuidor/shared';

export type ExpenseSummary = {
  todayTotal: number;
  todayCount: number;
  /** Cuantos gastos de hoy quedaron sin foto del ticket. */
  missingReceiptCount: number;
  /** Ultimos siete dias, incluido hoy. */
  weekTotal: number;
};

const dayOf = (iso: string): string => iso.slice(0, 10);

/** Mismo criterio de "hoy" que usan el resumen de ventas y la portada. */
export function todayExpensesOf(expenses: ExpenseRecord[], today: string): ExpenseRecord[] {
  return expenses.filter((expense) => dayOf(expense.createdAt) === today);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Los cuatro numeros que encabezan Gastos, calculados de una sola pasada sobre
 * lo que `GET /expenses/mine` ya devuelve.
 *
 * `missingReceiptCount` trata una referencia vacia igual que una ausente: un
 * gasto con `receiptRef: ''` quedo sin respaldo lo mismo que uno sin el campo,
 * y contarlo como cubierto seria mentirle al chofer sobre lo que le falta.
 */
export function summarizeExpenses(
  expenses: ExpenseRecord[],
  reference: Date = new Date(),
): ExpenseSummary {
  const today = reference.toISOString().slice(0, 10);
  const weekStart = reference.getTime() - WEEK_MS;

  const todays = todayExpensesOf(expenses, today);

  return {
    todayTotal: todays.reduce((sum, expense) => sum + expense.amount, 0),
    todayCount: todays.length,
    missingReceiptCount: todays.filter((expense) => !expense.receiptRef).length,
    weekTotal: expenses
      .filter((expense) => new Date(expense.createdAt).getTime() >= weekStart)
      .reduce((sum, expense) => sum + expense.amount, 0),
  };
}
