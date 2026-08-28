import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { StatTile } from './StatTile';
import { colors } from '../theme/colors';

describe('StatTile', () => {
  it('shows the value above its label', async () => {
    await render(<StatTile value={13} label="Activas" testID="activas" />);

    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText('Activas')).toBeTruthy();
  });

  it('greys a zero out, so only the numbers that need attention stand out', async () => {
    await render(<StatTile value={0} label="Anuladas" tone="error" testID="anuladas" />);

    expect(StyleSheet.flatten(screen.getByTestId('anuladas-value').props.style).color).toBe(colors.textSecondary);
  });

  it('colours a non-zero value by its tone', async () => {
    await render(<StatTile value={2} label="En cola" tone="warning" testID="cola" />);

    expect(StyleSheet.flatten(screen.getByTestId('cola-value').props.style).color).toBe(colors.warning);
  });
});
