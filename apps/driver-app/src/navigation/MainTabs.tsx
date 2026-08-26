import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SyncScreen } from '../screens/SyncScreen';
import { ExpensesStack } from './ExpensesStack';
import { HomeStack } from './HomeStack';
import { NewSaleStack } from './NewSaleStack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type MainTabParamList = {
  Inicio: undefined;
  'Nueva Venta': undefined;
  Gastos: undefined;
  Sincronización: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

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
        component={HomeStack}
        options={{
          tabBarIcon: makeTabIcon('home-outline', 'tab-icon-inicio'),
        }}
      />
      <Tab.Screen
        name="Nueva Venta"
        component={NewSaleStack}
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
        component={ExpensesStack}
        options={{
          tabBarIcon: makeTabIcon('wallet-outline', 'tab-icon-gastos'),
        }}
      />
      <Tab.Screen
        name="Sincronización"
        component={SyncScreen}
        options={{
          tabBarIcon: makeTabIcon('sync-outline', 'tab-icon-sincronizacion'),
        }}
      />
    </Tab.Navigator>
  );
}
