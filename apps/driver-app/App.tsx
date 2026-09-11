import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import { TruckProvider } from './src/context/TruckContext';
import { CatalogProvider } from './src/context/CatalogContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { useTheme } from './src/theme/ThemeContext';

/**
 * Los iconos del sistema son lo contrario del fondo de la app: oscuros sobre
 * el fondo claro, claros sobre el oscuro. Vive en su propio componente porque
 * tiene que leer el tema, y para eso tiene que estar DENTRO del provider.
 *
 * Las pantallas con barra oscura arriba pisan esto con su propio `light`
 * (ver ScreenContainer): esa barra es azul en los dos temas.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();

  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/* El tema envuelve a todo: no hay pantalla que no pinte un color. */}
      <ThemeProvider>
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
        <ThemedStatusBar />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
