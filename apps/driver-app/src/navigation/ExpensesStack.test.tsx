// ExpensesStack wires the existing ExpensesScreen together with the new
// ExpensesHistoryScreen so the "Gastos" bottom tab can push a detail screen
// (the tab previously rendered ExpensesScreen bare). Same "stack inside a
// tab" shape HomeStack/NewSaleStack already use. Like NewSaleStack.test.tsx,
// this inspects the JSX tree the component returns directly — ExpensesStack
// is a plain function with no hooks of its own — so it avoids mocking out
// ExpensesScreen's heavy expo-file-system / AuthContext dependencies, which
// are covered by that screen's own test file.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { ExpensesStack, type ExpensesStackParamList } from './ExpensesStack';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { ExpensesHistoryScreen } from '../screens/ExpensesHistoryScreen';

describe('ExpensesStack', () => {
  it('registers Expenses as the initial route, rendering ExpensesScreen', () => {
    const element = ExpensesStack() as React.ReactElement<{
      initialRouteName: keyof ExpensesStackParamList;
      children: React.ReactElement[];
    }>;

    expect(element.props.initialRouteName).toBe('Expenses');

    const children = React.Children.toArray(element.props.children) as React.ReactElement<{
      name: keyof ExpensesStackParamList;
      component: unknown;
    }>[];
    const expensesScreen = children.find((child) => child.props.name === 'Expenses');

    expect(expensesScreen).toBeTruthy();
    expect(expensesScreen?.props.component).toBe(ExpensesScreen);
  });

  it('registers ExpensesHistory with its own header and title', () => {
    const element = ExpensesStack() as React.ReactElement<{
      children: React.ReactElement[];
    }>;

    const children = React.Children.toArray(element.props.children) as React.ReactElement<{
      name: keyof ExpensesStackParamList;
      component: unknown;
      options?: { headerShown?: boolean; title?: string };
    }>[];
    const historyScreen = children.find((child) => child.props.name === 'ExpensesHistory');

    expect(historyScreen).toBeTruthy();
    expect(historyScreen?.props.component).toBe(ExpensesHistoryScreen);
    expect(historyScreen?.props.options).toMatchObject({
      headerShown: true,
      title: 'Historial de gastos',
    });
  });
});
