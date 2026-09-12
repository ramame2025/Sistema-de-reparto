jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/SyncContext', () => ({ useSync: jest.fn() }));

// Estas pruebas invocan MainTabs() como funcion pelada para inspeccionar el
// arbol que devuelve, asi que no hay dispatcher de hooks: la paleta se sirve
// directa, igual que useSync.
jest.mock('../theme/ThemeContext', () => ({
  useColors: () => require('../theme/colors').lightColors,
}));

import React from 'react';
import { MainTabs, type MainTabParamList } from './MainTabs';
import { useSync } from '../context/SyncContext';

const mockedUseSync = useSync as jest.Mock;

const screenOptions = () => {
  const element = MainTabs() as React.ReactElement<{
    screenOptions?: { tabBarStyle?: { backgroundColor?: string; borderTopColor?: string } };
  }>;
  return element.props.screenOptions;
};

const optionsFor = (name: keyof MainTabParamList) => {
  const element = MainTabs() as React.ReactElement<{ children: React.ReactElement[] }>;
  const children = React.Children.toArray(element.props.children) as React.ReactElement<{
    name: keyof MainTabParamList;
    options?: { tabBarBadge?: number };
  }>[];
  return children.find((child) => child.props.name === name)?.props.options;
};

describe('MainTabs/badge de pendientes', () => {
  it('badges the sync tab with how many sales are still on the phone', () => {
    mockedUseSync.mockReturnValue({ pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }] });

    expect(optionsFor('Sincronización')?.tabBarBadge).toBe(2);
  });

  it('carries no badge when the queue is empty, so the tab reads as quiet', () => {
    mockedUseSync.mockReturnValue({ pendingSales: [] });

    expect(optionsFor('Sincronización')?.tabBarBadge).toBeUndefined();
  });

  it('never badges the other tabs', () => {
    mockedUseSync.mockReturnValue({ pendingSales: [{ queueId: 'q1' }] });

    expect(optionsFor('Inicio')?.tabBarBadge).toBeUndefined();
    expect(optionsFor('Nueva Venta')?.tabBarBadge).toBeUndefined();
    expect(optionsFor('Gastos')?.tabBarBadge).toBeUndefined();
  });
});

describe('MainTabs/colores de la barra', () => {
  beforeEach(() => {
    mockedUseSync.mockReturnValue({ pendingSales: [] });
  });

  it('paints the bar itself, which React Navigation would otherwise leave white', async () => {
    // La barra de abajo no pasa por ningun StyleSheet nuestro: sin decirselo,
    // se queda blanca con la app en oscuro.
    const { lightColors } = require('../theme/colors');

    expect(screenOptions()?.tabBarStyle).toEqual({
      backgroundColor: lightColors.surface,
      borderTopColor: lightColors.border,
    });
  });

  it('tints the emphasised tab with the foreground blue, not the bar blue', async () => {
    const { lightColors } = require('../theme/colors');
    const options = optionsFor('Nueva Venta') as { tabBarActiveTintColor?: string };

    expect(options.tabBarActiveTintColor).toBe(lightColors.accent);
  });
});
