import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ExpenseHeader } from './ExpenseHeader';

describe('ExpenseHeader/cargando un gasto', () => {
  it('puts the day on the left and what is already spent on the right', async () => {
    await render(
      <ExpenseHeader
        eyebrow="NUEVO GASTO · C-04"
        title="jueves 27/08"
        amount={57100}
        amountLabel="gastado hoy"
        testID="header"
      />,
    );

    expect(screen.getByText('NUEVO GASTO · C-04')).toBeTruthy();
    expect(screen.getByText('jueves 27/08')).toBeTruthy();
    expect(screen.getByTestId('header-amount')).toHaveTextContent('$57.100');
    expect(screen.getByText('gastado hoy')).toBeTruthy();
  });
});

describe('ExpenseHeader/resumen del dia', () => {
  it('leads with the amount when there is no day to put beside it', async () => {
    await render(
      <ExpenseHeader
        eyebrow="GASTOS · JUEVES 27/08"
        amount={57100}
        subtitle="3 gastos · 1 sin comprobante"
        testID="header"
      />,
    );

    expect(screen.getByTestId('header-amount')).toHaveTextContent('$57.100');
    expect(screen.getByText('3 gastos · 1 sin comprobante')).toBeTruthy();
  });

  it('reads zero rather than blank on a day with nothing spent yet', async () => {
    await render(<ExpenseHeader eyebrow="GASTOS · JUEVES 27/08" amount={0} testID="header" />);

    expect(screen.getByTestId('header-amount')).toHaveTextContent('$0');
  });
});
