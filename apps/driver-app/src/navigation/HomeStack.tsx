import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { LoadManifestScreen } from '../screens/LoadManifestScreen';

export type HomeStackParamList = {
  Home: undefined;
  LoadManifest: undefined;
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
    </Stack.Navigator>
  );
}
