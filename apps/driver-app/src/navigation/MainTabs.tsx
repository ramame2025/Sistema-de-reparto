import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type MainTabParamList = {
  Inicio: undefined;
  'Nueva Venta': undefined;
  Gastos: undefined;
  Sincronización: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Temporary placeholder for a tab whose real screen has not been extracted
 * from App.tsx yet. Each of these is replaced one at a time in PR6–PR9
 * (HomeScreen, NewSaleScreen, ExpensesScreen, SyncScreen).
 */
function ComingSoonScreen({ label }: { label: string }) {
  return (
    <ScreenContainer>
      <View style={styles.stub}>
        <Text style={styles.stubText}>{label} — Próximamente</Text>
      </View>
    </ScreenContainer>
  );
}

const HomeStub = () => <ComingSoonScreen label="Inicio" />;
const NewSaleStub = () => <ComingSoonScreen label="Nueva Venta" />;
const ExpensesStub = () => <ComingSoonScreen label="Gastos" />;
const SyncStub = () => <ComingSoonScreen label="Sincronización" />;

type TabIconProps = { color: string; size: number };

const makeTabIcon =
  (iconName: keyof typeof Ionicons.glyphMap, testID: string) =>
  ({ color, size }: TabIconProps) => (
    <Ionicons name={iconName} size={size} color={color} testID={testID} />
  );

/**
 * Main Bottom Tab Navigator — reachable only while
 * `AuthContext.status === 'authenticated'`. Exposes exactly 4 tabs, each
 * with an icon AND a visible text label (never icon-only). "Nueva Venta"
 * carries primary visual emphasis (distinct active tint + bold label).
 */
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium },
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={HomeStub}
        options={{
          tabBarIcon: makeTabIcon('home-outline', 'tab-icon-inicio'),
        }}
      />
      <Tab.Screen
        name="Nueva Venta"
        component={NewSaleStub}
        options={{
          tabBarIcon: makeTabIcon('add-circle-outline', 'tab-icon-nueva-venta'),
          tabBarActiveTintColor: colors.primary,
          tabBarLabelStyle: {
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.bold,
          },
        }}
      />
      <Tab.Screen
        name="Gastos"
        component={ExpensesStub}
        options={{
          tabBarIcon: makeTabIcon('wallet-outline', 'tab-icon-gastos'),
        }}
      />
      <Tab.Screen
        name="Sincronización"
        component={SyncStub}
        options={{
          tabBarIcon: makeTabIcon('sync-outline', 'tab-icon-sincronizacion'),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  stub: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stubText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
});
