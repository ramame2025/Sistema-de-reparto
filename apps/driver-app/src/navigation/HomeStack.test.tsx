// HomeStack wires two screens together (Phase 3 PR5, docs/plans/load-manifest.md,
// design decision #7): Home -> LoadManifest, reached via a CTA HomeScreen gains
// in this same PR. This test only exercises the NAVIGATOR wiring (initial route,
// forward navigation, back navigation) — it mocks both screens out with minimal
// stand-ins so it stays independent of HomeScreen/LoadManifestScreen's own
// context dependencies (AuthContext/SyncContext/TruckContext), which are covered
// by their own dedicated test files.
jest.mock('../screens/HomeScreen', () => {
  const { useNavigation } = require('@react-navigation/native');
  const { Text, Pressable } = require('react-native');
  return {
    HomeScreen: () => {
      const navigation = useNavigation();
      return (
        <>
          <Text testID="home-stack-fake-home">Home fake</Text>
          <Pressable
            testID="home-stack-go-to-manifest"
            onPress={() => navigation.navigate('LoadManifest')}
          >
            <Text>Ir a cargar camion</Text>
          </Pressable>
        </>
      );
    },
  };
});

jest.mock('../screens/LoadManifestScreen', () => {
  const { useNavigation } = require('@react-navigation/native');
  const { Text, Pressable } = require('react-native');
  return {
    LoadManifestScreen: () => {
      const navigation = useNavigation();
      return (
        <>
          <Text testID="home-stack-fake-manifest">Manifest fake</Text>
          <Pressable testID="home-stack-go-back" onPress={() => navigation.goBack()}>
            <Text>Volver</Text>
          </Pressable>
        </>
      );
    },
  };
});

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { HomeStack } from './HomeStack';

describe('HomeStack', () => {
  it('starts on Home, navigates to LoadManifest, and can navigate back', async () => {
    await render(
      <NavigationContainer>
        <HomeStack />
      </NavigationContainer>,
    );

    expect(screen.getByTestId('home-stack-fake-home')).toBeTruthy();
    expect(screen.queryByTestId('home-stack-fake-manifest')).toBeNull();

    fireEvent.press(screen.getByTestId('home-stack-go-to-manifest'));

    await waitFor(() => expect(screen.getByTestId('home-stack-fake-manifest')).toBeTruthy());

    fireEvent.press(screen.getByTestId('home-stack-go-back'));

    await waitFor(() => expect(screen.getByTestId('home-stack-fake-home')).toBeTruthy());
    expect(screen.queryByTestId('home-stack-fake-manifest')).toBeNull();
  });
});
