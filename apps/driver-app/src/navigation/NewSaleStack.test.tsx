// NewSaleStack wires two screens together (Phase 6 PR2,
// docs/plans/customer-picker-proximity.md design decision #6): Sale ->
// CustomerPicker, a modal-presented lookup reachable from "Nueva Venta".
// Unlike HomeStack.test.tsx (which renders the whole navigator and drives
// forward/back navigation), this test inspects the JSX tree NewSaleStack
// returns directly -- NewSaleStack is a plain function component with no
// hooks of its own, so calling it outside of render() is safe and lets this
// test assert the initial route and the CustomerPicker screen's
// presentation:'modal' option without needing to mock out NewSaleScreen's/
// CustomerPickerScreen's own heavy context dependencies
// (AuthContext/SyncContext/TruckContext), which are covered by their own
// dedicated test files.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { NewSaleStack, type NewSaleStackParamList } from './NewSaleStack';
import { NewSaleScreen } from '../screens/NewSaleScreen';
import { CustomerPickerScreen } from '../screens/CustomerPickerScreen';

describe('NewSaleStack', () => {
  it('registers Sale as the initial route, rendering NewSaleScreen', () => {
    const element = NewSaleStack() as React.ReactElement<{
      initialRouteName: keyof NewSaleStackParamList;
      children: React.ReactElement[];
    }>;

    expect(element.props.initialRouteName).toBe('Sale');

    const children = React.Children.toArray(element.props.children) as React.ReactElement<{
      name: keyof NewSaleStackParamList;
      component: unknown;
    }>[];
    const saleScreen = children.find((child) => child.props.name === 'Sale');

    expect(saleScreen).toBeTruthy();
    expect(saleScreen?.props.component).toBe(NewSaleScreen);
  });

  it('registers CustomerPicker with presentation: modal', () => {
    const element = NewSaleStack() as React.ReactElement<{
      children: React.ReactElement[];
    }>;

    const children = React.Children.toArray(element.props.children) as React.ReactElement<{
      name: keyof NewSaleStackParamList;
      component: unknown;
      options?: { presentation?: string; headerShown?: boolean; title?: string };
    }>[];
    const pickerScreen = children.find((child) => child.props.name === 'CustomerPicker');

    expect(pickerScreen).toBeTruthy();
    expect(pickerScreen?.props.component).toBe(CustomerPickerScreen);
    expect(pickerScreen?.props.options).toMatchObject({
      presentation: 'modal',
      headerShown: true,
      title: 'Elegir cliente',
    });
  });
});
