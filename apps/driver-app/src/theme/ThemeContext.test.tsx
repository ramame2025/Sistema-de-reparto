import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { useColors, useTheme } from './ThemeContext';
import { lightColors } from './colors';

// A proposito sin ThemeProvider Y sin mock de AsyncStorage: este archivo
// existe para probar que leer un color no necesita ni una cosa ni la otra.

function Probe() {
  const colors = useColors();
  const { scheme } = useTheme();

  return (
    <>
      <Text testID="surface">{colors.surface}</Text>
      <Text testID="scheme">{scheme}</Text>
    </>
  );
}

describe('useColors without a provider', () => {
  it('serves the light palette instead of throwing', async () => {
    // Decenas de suites montan un componente suelto sin envolverlo en nada.
    // Si esto tirara, la app seguiria andando y los tests se caerian todos.
    await render(<Probe />);

    expect(screen.getByTestId('surface').props.children).toBe(lightColors.surface);
    expect(screen.getByTestId('scheme').props.children).toBe('light');
  });

  it('makes a theme change a no-op rather than a crash', async () => {
    let setScheme: ((scheme: 'light' | 'dark') => void) | undefined;

    function Grab() {
      setScheme = useTheme().setScheme;
      return null;
    }

    await render(<Grab />);

    expect(() => setScheme?.('dark')).not.toThrow();
  });
});
