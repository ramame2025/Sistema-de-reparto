import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SaleRecord } from '@distribuidor/shared';
import { AssignedCustomersScreen } from '../screens/AssignedCustomersScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoadManifestScreen } from '../screens/LoadManifestScreen';
import { ManifestHistoryScreen } from '../screens/ManifestHistoryScreen';
import { SaleDetailScreen } from '../screens/SaleDetailScreen';
import { SalesHistoryScreen } from '../screens/SalesHistoryScreen';

export type HomeStackParamList = {
  Home: undefined;
  LoadManifest: undefined;
  AssignedCustomers: undefined;
  SalesHistory: undefined;
  /**
   * The full record travels as a param instead of an id: the history list
   * already fetched it whole, so re-reading it from the API would be a round
   * trip for data the app is holding — and would fail offline, which is
   * exactly when a driver needs to fix a sale.
   */
  SaleDetail: { sale: SaleRecord };
  ManifestHistory: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

/**
 * Home Stack — nested under MainTabs' "Inicio" tab (Phase 3 PR5,
 * docs/plans/load-manifest.md design decision #7: a stack screen pushed from
 * HomeScreen, not a 5th bottom tab). Two screens: `Home` (the existing
 * day-summary card, now also showing the manifest-status banner + CTA) and
 * `LoadManifest` (PR4's form, unchanged here).
 *
 * `Home` keeps `headerShown: false` (same as the rest of the app — HomeScreen
 * renders its own "Distribuidor" tag as a lightweight header). `LoadManifest`
 * gets the native-stack default header back, since it is the only screen that
 * needs a "volver" affordance and LoadManifestScreen itself has no back
 * button of its own — this is the design's explicit "headerShown decision
 * left to implementation" call, resolved here without touching
 * LoadManifestScreen.tsx.
 *
 * `AssignedCustomers` (Phase 4 PR4, docs/plans/live-dashboard-assigned-customers.md,
 * Sub-change B, design decision #9) is wired the exact same way as
 * `LoadManifest`: a plain pushed screen, own header — not a modal, since
 * this is a read-only view opened a few times a day, not a picker invoked
 * on every sale (phase 6's `CustomerPicker` precedent doesn't apply here).
 *
 * `SalesHistory` / `ManifestHistory` are two more read-only pushed screens
 * cut from the same cloth: each lists a driver-scoped `/mine` endpoint that
 * already existed but was only ever consumed as an aggregate (day summary)
 * or a boolean (loaded-today?), never as a browsable list. Reached from
 * secondary buttons on HomeScreen's existing summary/manifest cards.
 */
export function HomeStack() {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="LoadManifest"
        component={LoadManifestScreen}
        options={{ headerShown: true, title: 'Cargar camión' }}
      />
      <Stack.Screen
        name="AssignedCustomers"
        component={AssignedCustomersScreen}
        options={{ headerShown: true, title: 'Clientes de hoy' }}
      />
      <Stack.Screen
        name="SalesHistory"
        component={SalesHistoryScreen}
        options={{ headerShown: true, title: 'Historial de ventas' }}
      />
      <Stack.Screen
        name="SaleDetail"
        component={SaleDetailScreen}
        options={{ headerShown: true, title: 'Detalle de venta' }}
      />
      <Stack.Screen
        name="ManifestHistory"
        component={ManifestHistoryScreen}
        options={{ headerShown: true, title: 'Historial de remitos' }}
      />
    </Stack.Navigator>
  );
}
