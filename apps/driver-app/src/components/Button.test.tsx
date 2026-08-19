import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Button } from './Button';
import { MIN_TOUCH_TARGET } from '../theme/spacing';

describe('Button', () => {
  it('renders the given label', async () => {
    await render(<Button label="Guardar venta" onPress={() => {}} />);
    expect(screen.getByText('Guardar venta')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button label="Confirmar" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('enforces a minimum 48x48px touch target via computed style', async () => {
    await render(<Button label="Enviar" onPress={() => {}} />);
    const button = screen.getByRole('button');
    const flatStyle = StyleSheet.flatten(button.props.style);
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(flatStyle.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Deshabilitado" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
