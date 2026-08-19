import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export type ScreenContainerProps = {
  children: React.ReactNode;
  scroll?: boolean;
  testID?: string;
};

// NOTE: uses React Native's built-in SafeAreaView as a placeholder.
// This will be revisited in PR5 (navigation shell) once
// react-native-safe-area-context is installed and SafeAreaProvider
// wraps the app, giving accurate insets on Android/web too.
export function ScreenContainer({
  children,
  scroll = false,
  testID,
}: ScreenContainerProps) {
  const Content = scroll ? ScrollView : React.Fragment;
  const contentProps = scroll
    ? { contentContainerStyle: styles.scrollContent }
    : {};

  return (
    <SafeAreaView testID={testID} style={styles.container}>
      <Content {...contentProps}>{children}</Content>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
  },
});
