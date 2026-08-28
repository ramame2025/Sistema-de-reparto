import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CustomerCard } from './CustomerCard';

describe('CustomerCard', () => {
  it('shows the picked customer name and its type as the subtitle', async () => {
    await render(
      <CustomerCard name="Kiosco La Esquina" subtitle="Comercio" onPress={() => {}} />,
    );
    expect(screen.getByText('Kiosco La Esquina')).toBeTruthy();
    expect(screen.getByText('Comercio')).toBeTruthy();
  });

  it('prompts for a customer when none was picked yet', async () => {
    await render(<CustomerCard onPress={() => {}} />);
    expect(screen.getByText('Elegí un cliente')).toBeTruthy();
  });

  it('opens the picker when tapped', async () => {
    const onPress = jest.fn();
    await render(<CustomerCard name="Marta Suárez" subtitle="Final" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
