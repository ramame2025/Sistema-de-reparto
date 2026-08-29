import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { ExpensesHistoryScreen } from '../screens/ExpensesHistoryScreen';
import { ExpenseResultScreen } from '../screens/ExpenseResultScreen';
import type { ExpenseCategory } from '@distribuidor/shared';

export type ExpensesStackParamList = {
  Expenses: undefined;
  /**
   * Solo el gasto recien guardado. El resto de la pantalla (total del dia,
   * lista, semana) se relee de la API, para que no dependa de un parametro que
   * envejece si el chofer se queda ahi.
   */
  ExpenseResult: { category: ExpenseCategory; amount: number; hasReceipt: boolean };
  ExpensesHistory: undefined;
};

const Stack = createNativeStackNavigator<ExpensesStackParamList>();

/**
 * Expenses Stack — nested under MainTabs' "Gastos" tab. The tab previously
 * rendered `ExpensesScreen` directly; wrapping it in a stack (the same shape
 * HomeStack / NewSaleStack already use) lets it push `ExpensesHistory`, a
 * read-only list of the driver's own expenses backed by the new
 * `GET /expenses/mine` endpoint.
 *
 * `Expenses` keeps `headerShown: false` (it renders its own "Distribuidor"
 * tag like the rest of the app). `ExpensesHistory` gets the native-stack
 * header back for its "volver" affordance, same call HomeStack makes for
 * `LoadManifest` / `AssignedCustomers` / the other history screens.
 */
export function ExpensesStack() {
  return (
    <Stack.Navigator initialRouteName="Expenses" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Expenses" component={ExpensesScreen} />
      <Stack.Screen
        name="ExpenseResult"
        component={ExpenseResultScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ExpensesHistory"
        component={ExpensesHistoryScreen}
        options={{ headerShown: true, title: 'Historial de gastos' }}
      />
    </Stack.Navigator>
  );
}
