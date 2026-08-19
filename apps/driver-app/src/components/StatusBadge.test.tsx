import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { StatusBadge } from './StatusBadge';
import { colors } from '../theme/colors';

describe('StatusBadge', () => {
  it('renders the given label', async () => {
    await render(<StatusBadge label="Sincronizado" status="success" />);
    expect(screen.getByText('Sincronizado')).toBeTruthy();
  });

  it('uses the success color for status="success"', async () => {
    await render(<StatusBadge label="Sincronizado" status="success" testID="badge" />);
    const badge = screen.getByTestId('badge');
    const flatStyle = StyleSheet.flatten(badge.props.style);
    expect(flatStyle.backgroundColor).toBe(colors.success);
  });

  it('uses a different color for status="error" than status="success"', async () => {
    await render(<StatusBadge label="Falló" status="error" testID="badge" />);
    const badge = screen.getByTestId('badge');
    const flatStyle = StyleSheet.flatten(badge.props.style);
    expect(flatStyle.backgroundColor).toBe(colors.error);
    expect(flatStyle.backgroundColor).not.toBe(colors.success);
  });

  it('uses the warning color for status="warning"', async () => {
    await render(<StatusBadge label="Pendiente" status="warning" testID="badge" />);
    const badge = screen.getByTestId('badge');
    const flatStyle = StyleSheet.flatten(badge.props.style);
    expect(flatStyle.backgroundColor).toBe(colors.warning);
  });
});
