import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import { TruckProvider } from './src/context/TruckContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* TruckProvider va entre medio: Sync lee de el el codigo del camion. */}
        <TruckProvider>
          <SyncProvider>
            <RootNavigator />
          </SyncProvider>
        </TruckProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
