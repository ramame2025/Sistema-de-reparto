import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '../services/apiClient';
import { AuthRoleError, useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { PasswordInput } from '../components/PasswordInput';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeading } from '../components/ScreenHeading';
import { SectionLabel } from '../components/SectionLabel';
import { TextField } from '../components/TextField';
import { spacing } from '../theme/spacing';

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
        <ScreenHeading eyebrow="Distribuidor · App chofer" />
        <Card style={styles.card}>
          <SectionLabel variant="field">Login chofer</SectionLabel>
          <TextField
            value={username}
            onChangeText={setUsername}
            placeholder="Usuario"
            autoCapitalize="none"
          />
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            onSubmitEditing={() => void handleLogin()}
            testID="login-password"
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
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
});
