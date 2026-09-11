jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './ThemeContext';
import { darkColors, lightColors } from './colors';

const STORAGE_KEY = '@distribuidor/color-scheme';

function Probe() {
  const { scheme, colors, setScheme } = useTheme();

  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="surface">{colors.surface}</Text>
      <Text testID="to-dark" onPress={() => setScheme('dark')}>
        oscuro
      </Text>
      <Text testID="to-light" onPress={() => setScheme('light')}>
        claro
      </Text>
    </>
  );
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );

describe('ThemeProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('starts on the light palette, which is what the app declares', async () => {
    await renderProbe();

    expect(screen.getByTestId('scheme').props.children).toBe('light');
    expect(screen.getByTestId('surface').props.children).toBe(lightColors.surface);
  });

  it('hands out the dark palette once the driver asks for it', async () => {
    await renderProbe();

    await act(async () => {
      screen.getByTestId('to-dark').props.onPress();
    });

    expect(screen.getByTestId('surface').props.children).toBe(darkColors.surface);
  });

  it('remembers the choice for the next time the app opens', async () => {
    await renderProbe();

    await act(async () => {
      screen.getByTestId('to-dark').props.onPress();
    });

    await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('dark'));
  });

  it('restores the stored choice on a fresh start', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'dark');

    await renderProbe();

    await waitFor(() => expect(screen.getByTestId('scheme').props.children).toBe('dark'));
  });

  it('ignores a stored value that is not a theme, instead of trusting it', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'fucsia');

    await renderProbe();

    expect(screen.getByTestId('scheme').props.children).toBe('light');
  });

  it('still applies the change when persisting it fails', async () => {
    // Perder la preferencia es molesto; ignorar el toque que el chofer acaba
    // de dar es peor.
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disco lleno'));

    await renderProbe();

    await act(async () => {
      screen.getByTestId('to-dark').props.onPress();
    });

    expect(screen.getByTestId('scheme').props.children).toBe('dark');
  });

  it('falls back to light when the stored preference cannot be read at all', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage caido'));

    await renderProbe();

    expect(screen.getByTestId('scheme').props.children).toBe('light');
  });
});
