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
});
