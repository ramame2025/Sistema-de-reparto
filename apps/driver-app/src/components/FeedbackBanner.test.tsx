import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FeedbackBanner } from './FeedbackBanner';

describe('FeedbackBanner', () => {
  it('renders the success message with role alert', async () => {
    await render(<FeedbackBanner message="Venta guardada" tone="success" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Venta guardada');
  });

  it('renders the error message with role alert', async () => {
    await render(<FeedbackBanner message="No se pudo guardar" tone="error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
  });

  it('renders nothing when message is null', async () => {
    await render(<FeedbackBanner message={null} tone="success" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
