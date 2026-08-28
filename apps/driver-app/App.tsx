import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import { TruckProvider } from './src/context/TruckContext';
import { CatalogProvider } from './src/context/CatalogContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* TruckProvider va entre medio: Sync lee de el el codigo del camion. */}
        <TruckProvider>
          {/* El catalogo y los precios los consumen las pantallas de venta y
              de remito, asi que va por fuera del navegador. */}
          <CatalogProvider>
            <SyncProvider>
              <RootNavigator />
            </SyncProvider>
          </CatalogProvider>
        </TruckProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
