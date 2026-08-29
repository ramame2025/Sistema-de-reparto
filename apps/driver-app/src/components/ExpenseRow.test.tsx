import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ExpenseRow } from './ExpenseRow';

describe('ExpenseRow', () => {
  it('names the category with its amount, and when it happened', async () => {
    await render(
      <ExpenseRow
        category="combustible"
        amount={45000}
        createdAt="2026-08-28T08:02:00.000Z"
        note="YPF Ruta 8"
        testID="row"
      />,
    );

    expect(screen.getByText('Combustible · $45.000')).toBeTruthy();
    expect(screen.getByTestId('row-detail')).toHaveTextContent(/YPF Ruta 8/);
  });

  it('shows the time alone when the driver did not say where it was', async () => {
    await render(
      <ExpenseRow
        category="comida"
        amount={9800}
        createdAt="2026-08-28T13:20:00.000Z"
        testID="row"
      />,
    );

    expect(screen.getByTestId('row-detail')).not.toHaveTextContent(/·/);
  });

  it('confirms the receipt is on file', async () => {
    await render(
      <ExpenseRow
        category="combustible"
        amount={45000}
        createdAt="2026-08-28T08:02:00.000Z"
        receiptRef="https://cdn.test/t.jpg"
        testID="row"
      />,
    );

    expect(screen.getByTestId('row-has-receipt')).toBeTruthy();
    expect(screen.queryByText('Falta el comprobante')).toBeNull();
  });

  it('says the receipt is missing instead of just leaving the tick off', async () => {
    await render(
      <ExpenseRow category="peaje" amount={2300} createdAt="2026-08-28T09:00:00.000Z" testID="row" />,
    );

    expect(screen.getByText('Falta el comprobante')).toBeTruthy();
    expect(screen.queryByTestId('row-has-receipt')).toBeNull();
  });
});
