import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ProductRow } from './ProductRow';

const baseProps = {
  code: 'G10',
  name: 'Garrafa 10 kg',
  unitPrice: 8200,
  quantity: 0,
  onIncrement: () => {},
  onDecrement: () => {},
};

describe('ProductRow', () => {
  it('shows the product code, its name and its unit price', async () => {
    await render(<ProductRow {...baseProps} />);
    expect(screen.getByText('G10')).toBeTruthy();
    expect(screen.getByText('Garrafa 10 kg · $8.200')).toBeTruthy();
  });

  it('shows only the name when the phone has no price for this product', async () => {
    await render(<ProductRow {...baseProps} unitPrice={undefined} />);
    expect(screen.getByText('Garrafa 10 kg')).toBeTruthy();
  });

  it('renders the current quantity', async () => {
    await render(<ProductRow {...baseProps} quantity={3} />);
    expect(screen.getByTestId('product-row-G10-quantity')).toHaveTextContent('3');
  });

  it('adds one unit when the plus control is tapped', async () => {
    const onIncrement = jest.fn();
    await render(<ProductRow {...baseProps} onIncrement={onIncrement} />);
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('removes one unit when the minus control is tapped', async () => {
    const onDecrement = jest.fn();
    await render(<ProductRow {...baseProps} quantity={2} onDecrement={onDecrement} />);
    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('does not decrement below zero', async () => {
    const onDecrement = jest.fn();
    await render(<ProductRow {...baseProps} quantity={0} onDecrement={onDecrement} />);
    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    expect(onDecrement).not.toHaveBeenCalled();
  });

  // La misma fila se usa ahora en tres listas de la misma pantalla: lo
  // vendido, los envases que vuelven y los cambios por falla. Sin un prefijo,
  // las tres publicarian el mismo testID para el mismo producto y ni un test
  // ni un lector de pantalla podrian decir a cual le estan tocando el mas.
  it('lets the list it belongs to own its testIDs', async () => {
    const onIncrement = jest.fn();
    await render(
      <ProductRow
        code="G10"
        name="Garrafa 10kg"
        quantity={0}
        testIDPrefix="swapped-row"
        onIncrement={onIncrement}
        onDecrement={() => {}}
      />,
    );

    expect(screen.getByTestId('swapped-row-G10')).toBeTruthy();
    expect(screen.getByTestId('swapped-row-G10-quantity')).toHaveTextContent('0');
    await fireEvent.press(screen.getByTestId('swapped-row-G10-increment'));
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('keeps the product-row prefix when the list does not ask for one', async () => {
    await render(
      <ProductRow
        code="G10"
        name="Garrafa 10kg"
        quantity={1}
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );

    expect(screen.getByTestId('product-row-G10')).toBeTruthy();
  });
});
