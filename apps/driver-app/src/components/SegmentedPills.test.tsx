import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SegmentedPills } from './SegmentedPills';

const OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transf.' },
  { value: 'qr', label: 'QR' },
  { value: 'tarjeta', label: 'Tarjeta' },
] as const;

describe('SegmentedPills', () => {
  it('renders one pill per option', async () => {
    await render(
      <SegmentedPills options={OPTIONS} value="efectivo" onChange={() => {}} testID="cobro" />,
    );
    OPTIONS.forEach((option) => {
      expect(screen.getByText(option.label)).toBeTruthy();
    });
  });

  it('marks the selected option as selected for assistive tech', async () => {
    await render(
      <SegmentedPills options={OPTIONS} value="transferencia" onChange={() => {}} testID="cobro" />,
    );
    expect(screen.getByTestId('cobro-transferencia').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('cobro-efectivo').props.accessibilityState.selected).toBe(false);
  });

  it('reports the picked value', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedPills options={OPTIONS} value="efectivo" onChange={onChange} testID="cobro" />,
    );
    await fireEvent.press(screen.getByTestId('cobro-qr'));
    expect(onChange).toHaveBeenCalledWith('qr');
  });
});

describe('SegmentedPills/varias filas', () => {
  const CATEGORIES = [
    { value: 'combustible', label: 'Combustible' },
    { value: 'peaje', label: 'Peaje' },
    { value: 'comida', label: 'Comida' },
    { value: 'mantenimiento', label: 'Mantenimiento' },
    { value: 'varios', label: 'Varios' },
  ] as const;

  it('lets the pills wrap instead of squeezing five of them into one row', async () => {
    await render(
      <SegmentedPills
        options={CATEGORIES}
        value="combustible"
        onChange={() => {}}
        wrap
        testID="categoria"
      />,
    );

    CATEGORIES.forEach((option) => {
      expect(screen.getByText(option.label)).toBeTruthy();
    });
    // Sin `flex: 1` cada pastilla mide lo que dice, que es lo que permite que
    // "Mantenimiento" no quede ilegible al lado de "Peaje".
    const style = StyleSheet.flatten(screen.getByTestId('categoria-peaje').props.style);
    expect(style.flex).toBeUndefined();
  });

  it('still stretches its pills to fill a single row by default', async () => {
    await render(
      <SegmentedPills options={OPTIONS} value="efectivo" onChange={() => {}} testID="cobro" />,
    );

    const style = StyleSheet.flatten(screen.getByTestId('cobro-qr').props.style);
    expect(style.flex).toBe(1);
  });
});
