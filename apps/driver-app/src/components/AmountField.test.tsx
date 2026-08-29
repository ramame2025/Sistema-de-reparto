import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AmountField } from './AmountField';

describe('AmountField', () => {
  it('shows the amount next to a peso sign instead of a bare number', async () => {
    await render(<AmountField value={45000} onChange={() => {}} testID="monto" />);

    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByTestId('monto-input').props.value).toBe('45.000');
  });

  it('reads empty rather than zero, so the driver types onto a blank field', async () => {
    await render(<AmountField value={0} onChange={() => {}} testID="monto" />);

    expect(screen.getByTestId('monto-input').props.value).toBe('');
  });

  it('reports what was typed as a number, ignoring anything that is not a digit', async () => {
    const onChange = jest.fn();
    await render(<AmountField value={0} onChange={onChange} testID="monto" />);

    await fireEvent.changeText(screen.getByTestId('monto-input'), '12.500');
    expect(onChange).toHaveBeenCalledWith(12500);
  });

  it('adds a quick amount on top of what is already there', async () => {
    const onChange = jest.fn();
    await render(<AmountField value={5000} onChange={onChange} testID="monto" />);

    await fireEvent.press(screen.getByTestId('monto-add-10000'));
    expect(onChange).toHaveBeenCalledWith(15000);
  });

  it('clears the field in one tap', async () => {
    const onChange = jest.fn();
    await render(<AmountField value={45000} onChange={onChange} testID="monto" />);

    await fireEvent.press(screen.getByTestId('monto-clear'));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('opens the numeric keypad, not the full keyboard', async () => {
    await render(<AmountField value={0} onChange={() => {}} testID="monto" />);

    expect(screen.getByTestId('monto-input').props.keyboardType).toBe('numeric');
  });
});
