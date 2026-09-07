import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ScreenHeading } from './ScreenHeading';

describe('ScreenHeading', () => {
  it('renders the eyebrow and the title', async () => {
    await render(
      <ScreenHeading eyebrow="Distribuidor · App chofer" title="Cargar camión" />,
    );
    expect(screen.getByText('Distribuidor · App chofer')).toBeTruthy();
    expect(screen.getByText('Cargar camión')).toBeTruthy();
  });

  it('renders only the title when there is no eyebrow', async () => {
    await render(<ScreenHeading title="Historial de ventas" />);
    expect(screen.getByText('Historial de ventas')).toBeTruthy();
    expect(screen.queryByText('Distribuidor · App chofer')).toBeNull();
  });
});
