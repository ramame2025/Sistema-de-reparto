jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/SyncContext', () => ({ useSync: jest.fn() }));

import React from 'react';
import { MainTabs, type MainTabParamList } from './MainTabs';
import { useSync } from '../context/SyncContext';

const mockedUseSync = useSync as jest.Mock;

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
