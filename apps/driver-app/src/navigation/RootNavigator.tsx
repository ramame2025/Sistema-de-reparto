import { useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';

/**
 * Reads `AuthContext.status` and gates between three states:
 * - "checking": a loading indicator (no navigator mounted yet)
 * - "anonymous": the Auth Stack (Login only)
 * - "authenticated": the Main Bottom Tabs
 *
 * There is nothing to reset on logout: the Main tree unmounts, dropping
 * stale screen state for free (design decision #2).
 */
export function RootNavigator() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <View style={styles.loading} testID="root-navigator-loading">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {status === 'authenticated' ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
