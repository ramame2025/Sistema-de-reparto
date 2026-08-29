import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SummaryRow } from './SummaryRow';

describe('SummaryRow', () => {
  it('shows its title and supporting line', async () => {
    await render(
      <SummaryRow
        title="Remito cargado · 71 envases"
        subtitle="Hoy 07:10 · quedan 29 en el camión"
        onPress={() => {}}
        testID="remito"
      />,
    );

    expect(screen.getByText('Remito cargado · 71 envases')).toBeTruthy();
    expect(screen.getByText('Hoy 07:10 · quedan 29 en el camión')).toBeTruthy();
  });

  it('opens what it points at', async () => {
    const onPress = jest.fn();
    await render(<SummaryRow title="Ver todas las ventas de hoy" onPress={onPress} testID="ventas" />);

    await fireEvent.press(screen.getByTestId('ventas'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without a subtitle when there is nothing more to say', async () => {
    await render(<SummaryRow title="Ver todas las ventas de hoy" onPress={() => {}} testID="ventas" />);

    expect(screen.getByText('Ver todas las ventas de hoy')).toBeTruthy();
  });
});
