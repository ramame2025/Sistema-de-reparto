import { useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useColors, useTheme } from '../theme/ThemeContext';
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
  const { scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { status } = useAuth();

  // Lo que pinta React Navigation por su cuenta -- la barra de pestanas de
  // abajo y el encabezado de cada pantalla empujada -- no pasa por ningun
  // StyleSheet nuestro. Sin este tema queda blanco con texto oscuro encima de
  // una app en modo oscuro.
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.error,
      },
    };
  }, [scheme, colors]);

  if (status === 'checking') {
    return (
      <View style={styles.loading} testID="root-navigator-loading">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
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
