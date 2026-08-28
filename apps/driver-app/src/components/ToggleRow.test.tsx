import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ToggleRow } from './ToggleRow';

describe('ToggleRow', () => {
  it('shows its label and the current-state subtitle', async () => {
    await render(
      <ToggleRow
        label="Envase devuelto"
        subtitle="Sin marcar"
        value={false}
        onValueChange={() => {}}
        testID="container-returned"
      />,
    );
    expect(screen.getByText('Envase devuelto')).toBeTruthy();
    expect(screen.getByText('Sin marcar')).toBeTruthy();
  });

  it('reports the new value when flipped on', async () => {
    const onValueChange = jest.fn();
    await render(
      <ToggleRow
        label="Envase devuelto"
        subtitle="Sin marcar"
        value={false}
        onValueChange={onValueChange}
        testID="container-returned"
      />,
    );
    await fireEvent(screen.getByTestId('container-returned-switch'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('exposes the switch state to assistive tech', async () => {
    await render(
      <ToggleRow
        label="Envase devuelto"
        subtitle="Devuelto"
        value
        onValueChange={() => {}}
        testID="container-returned"
      />,
    );
    expect(screen.getByTestId('container-returned-switch').props.value).toBe(true);
  });
});
