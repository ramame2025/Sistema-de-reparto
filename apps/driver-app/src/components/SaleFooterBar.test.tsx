import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SaleFooterBar } from './SaleFooterBar';

describe('SaleFooterBar', () => {
  it('shows the running total formatted in pesos', async () => {
    await render(
      <SaleFooterBar total={14000} actionLabel="Guardar venta" onPress={() => {}} />,
    );
    expect(screen.getByText('TOTAL')).toBeTruthy();
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$14.000');
  });

  it('runs the action when the button is tapped', async () => {
    const onPress = jest.fn();
    await render(
      <SaleFooterBar total={14000} actionLabel="Guardar venta" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByTestId('sale-footer-action'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not run the action while disabled', async () => {
    const onPress = jest.fn();
    await render(
      <SaleFooterBar total={0} actionLabel="Agregá productos" onPress={onPress} disabled />,
    );
    await fireEvent.press(screen.getByTestId('sale-footer-action'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('names the amount TOTAL by default, as a sale reads it', async () => {
    await render(<SaleFooterBar total={0} actionLabel="Guardar" onPress={() => {}} />);

    expect(screen.getByText('TOTAL')).toBeTruthy();
  });

  it('takes another label for screens where the amount is not a sale total', async () => {
    // En Gastos el numero es lo que sale, no lo que entra.
    await render(
      <SaleFooterBar total={45000} totalLabel="GASTO" actionLabel="Guardar gasto" onPress={() => {}} />,
    );

    expect(screen.getByText('GASTO')).toBeTruthy();
    expect(screen.queryByText('TOTAL')).toBeNull();
  });
});
