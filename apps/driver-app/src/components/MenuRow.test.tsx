import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MenuRow } from './MenuRow';

describe('MenuRow', () => {
  it('takes the driver where the row says it goes', async () => {
    const onPress = jest.fn();
    await render(<MenuRow title="Remito de carga" onPress={onPress} testID="row" />);

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries a dato at the right margin for a row that informs instead of navigating', async () => {
    await render(<MenuRow title="Lista de precios" value="Actualizada 07:05" testID="row" />);

    expect(screen.getByText('Actualizada 07:05')).toBeTruthy();
  });

  it('does not answer a press while the feature behind it does not exist yet', async () => {
    // Una fila que se ve igual que el resto y no hace nada al tocarla le miente
    // al chofer: la apagada tiene que verse apagada.
    const onPress = jest.fn();
    await render(<MenuRow title="Ayuda" onPress={onPress} disabled testID="row" />);

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('row').props.accessibilityState).toEqual({ disabled: true });
  });
});
