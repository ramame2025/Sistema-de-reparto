import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { LoadingRow } from './LoadingRow';

describe('LoadingRow', () => {
  it('renders the label', async () => {
    await render(<LoadingRow label="Cargando tu historial..." />);
    expect(screen.getByText('Cargando tu historial...')).toBeTruthy();
  });

  it('exposes its testID so screens can assert the loading state', async () => {
    await render(<LoadingRow label="Actualizando resumen..." testID="home-summary-loading" />);
    expect(screen.getByTestId('home-summary-loading')).toBeTruthy();
  });
});
