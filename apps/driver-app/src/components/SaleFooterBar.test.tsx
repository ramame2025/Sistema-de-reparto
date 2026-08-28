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
});
