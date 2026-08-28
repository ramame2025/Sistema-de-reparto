import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
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
