import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CustomerType, PaymentMethod } from '@distribuidor/shared';
import { NewSaleScreen } from '../screens/NewSaleScreen';
import { CustomerPickerScreen } from '../screens/CustomerPickerScreen';
import { SaleResultScreen } from '../screens/SaleResultScreen';

export type NewSaleStackParamList = {
  Sale: { pickedCustomer?: { id: string; name: string; customerType: CustomerType } } | undefined;
  CustomerPicker: undefined;
  /**
   * `outcome` es la unica diferencia que le importa al chofer: 'sent' significa
   * que el servidor ya tiene la venta, 'queued' que todavia esta en el
   * telefono. Confundirlas lleva a cargar la misma venta dos veces.
   */
  SaleResult: {
    outcome: 'sent' | 'queued';
    customerName: string;
    total: number;
    paymentMethod: PaymentMethod;
  };
};

const Stack = createNativeStackNavigator<NewSaleStackParamList>();

/**
 * New Sale Stack — nested under MainTabs' "Nueva Venta" tab (Phase 6 PR2,
 * docs/plans/customer-picker-proximity.md, design decision #6: a
 * modal-presented picker screen inside a new stack, not a 5th bottom tab —
 * the same "stack inside a tab" shape HomeStack.tsx already established in
 * phase 3). Two screens: `Sale` (the existing NewSaleScreen, now
 * picker-aware via useRoute()/useNavigation()) and `CustomerPicker` (new,
 * v1 scope: search + manual select, no proximity/quick-create yet — that's
 * PR3).
 *
 * `Sale` keeps `headerShown: false`, same as the rest of the app.
 * `CustomerPicker` opts into `presentation: 'modal'` + its own header — the
 * first modal-presented screen in this codebase.
 */
export function NewSaleStack() {
  return (
    <Stack.Navigator initialRouteName="Sale" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Sale" component={NewSaleScreen} />
      <Stack.Screen
        name="SaleResult"
        component={SaleResultScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CustomerPicker"
        component={CustomerPickerScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Elegir cliente' }}
      />
    </Stack.Navigator>
  );
}
