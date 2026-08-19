import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the given title', async () => {
    await render(<EmptyState title="Sin ventas pendientes" />);
    expect(screen.getByText('Sin ventas pendientes')).toBeTruthy();
  });

  it('renders an optional description when provided', async () => {
    await render(
      <EmptyState
        title="Sin ventas pendientes"
        description="Todas las ventas están sincronizadas"
      />
    );
    expect(
      screen.getByText('Todas las ventas están sincronizadas')
    ).toBeTruthy();
  });

  it('does not render a description node when none is provided', async () => {
    await render(<EmptyState title="Sin gastos" />);
    expect(screen.queryByTestId('empty-state-description')).toBeNull();
  });
});
