import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../services/apiClient';
import { AuthRoleError, useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function LoginScreen() {
  const { login, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    try {
      await login(username, password);
    } catch (caught) {
      if (caught instanceof ApiError || caught instanceof AuthRoleError) {
        setError(caught.message);
      } else {
        setError('No se pudo iniciar sesion. Verifica credenciales/API.');
      }
    }
  };

  return (
    <ScreenContainer testID="login-screen">
      <View style={styles.centered}>
        <Text style={styles.tag}>Distribuidor · App chofer</Text>
        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>Login chofer</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Usuario"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            onSubmitEditing={() => void handleLogin()}
          />
          <Button
            label={loading ? 'Ingresando...' : 'Iniciar sesion'}
            onPress={() => void handleLogin()}
            disabled={loading}
          />
        </Card>
        <FeedbackBanner message={error} tone="error" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  tag: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
  },
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
});
