import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from './Card';

describe('Card', () => {
  it('renders its children', async () => {
    await render(
      <Card>
        <Text>Resumen del día</Text>
      </Card>
    );
    expect(screen.getByText('Resumen del día')).toBeTruthy();
  });

  it('renders multiple children passed to it', async () => {
    await render(
      <Card>
        <Text>Ventas activas</Text>
        <Text>Ventas canceladas</Text>
      </Card>
    );
    expect(screen.getByText('Ventas activas')).toBeTruthy();
    expect(screen.getByText('Ventas canceladas')).toBeTruthy();
  });
});
