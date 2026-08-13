import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type AuthLoginResponse,
  type AuthSessionResponse,
  type CancelSaleInput,
  CUSTOMER_TYPES,
  PAYMENT_METHODS,
  PRODUCT_CODES,
  DEFAULT_PRICE_TABLE,
  calculateSaleTotal,
  type CreateSaleInput,
  type CustomerType,
  type PaymentMethod,
  type ProductCode,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type SaleRecord,
  type UpdateSaleInput,
  type CreateExpenseInput,
} from '@distribuidor/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const OFFLINE_QUEUE_KEY = 'driver_pending_sales_v1';
const DRIVER_AUTH_TOKEN_KEY = 'driver_auth_token_v1';
const AUTO_SYNC_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

type PendingSale = {
  queueId: string;
  payload: CreateSaleInput;
  createdAt: string;
  retries: number;
  nextRetryAt: number;
  lastError?: string;
};

const normalizePendingSalePayload = (
  payload: CreateSaleInput,
  fallbackDriverName: string,
  fallbackTruckCode: string,
): CreateSaleInput => ({
  ...payload,
  driverName: payload.driverName?.trim() || fallbackDriverName,
  truckCode: payload.truckCode?.trim() || fallbackTruckCode || undefined,
});

type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

type DaySummary = {
  activeCount: number;
  canceledCount: number;
  activeTotal: number;
};

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [truckCode, setTruckCode] = useState('CAMION-01');
  const [customerType, setCustomerType] = useState<CustomerType>('final');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [customerName, setCustomerName] = useState('Cliente de prueba');
  const [quantities, setQuantities] = useState<Record<ProductCode, number>>({
    G10: 0,
    G15: 0,
    G45: 0,
    G15_AUTO: 0,
  });
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editReason, setEditReason] = useState('Correccion de carga');
  const [updating, setUpdating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [daySummary, setDaySummary] = useState<DaySummary>({
    activeCount: 0,
    canceledCount: 0,
    activeTotal: 0,
  });
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('combustible');
  const [expenseAmount, setExpenseAmount] = useState('0');
  const [expenseNote, setExpenseNote] = useState('');
  const [expenseReceiptRef, setExpenseReceiptRef] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const currentItems = useMemo(
    () =>
      PRODUCT_CODES.filter((code) => quantities[code] > 0).map((code) => ({
        productCode: code,
        quantity: quantities[code],
      })),
    [quantities],
  );

  const total = useMemo(
    () => calculateSaleTotal(customerType, currentItems, DEFAULT_PRICE_TABLE),
    [customerType, currentItems],
  );

  useEffect(() => {
    void loadAuthToken();
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    void loadPendingSales();
    void refreshDaySummary();
  }, [authToken]);

  useEffect(() => {
    const interval = setInterval(() => {
      void syncPendingSales(false);
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pendingSales]);

  const buildClientGeneratedId = () =>
    `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Validamos el token guardado contra la API antes de mostrar la app,
  // asi un token vencido vuelve al login en vez de entrar y fallar despues.
  const loadAuthToken = async () => {
    const savedToken = await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY);
    if (!savedToken) {
      setAuthStatus('anonymous');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${savedToken}` },
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const session: AuthSessionResponse = await response.json();
      if (session.role !== 'chofer' && session.role !== 'admin') {
        throw new Error('role');
      }

      setAuthUsername(session.username);
      setAuthToken(savedToken);
      setAuthStatus('authenticated');
    } catch {
      await AsyncStorage.removeItem(DRIVER_AUTH_TOKEN_KEY);
      setAuthToken(null);
      setAuthStatus('anonymous');
    }
  };

  const requireAuthToken = () => {
    if (!authToken) {
      setMessage('Inicia sesion para operar como chofer.');
      return null;
    }

    return authToken;
  };

  const login = async () => {
    try {
      setAuthLoading(true);
      setMessage(null);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const payload: AuthLoginResponse = await response.json();
      if (payload.role !== 'chofer' && payload.role !== 'admin') {
        setAuthToken(null);
        setAuthStatus('anonymous');
        await AsyncStorage.removeItem(DRIVER_AUTH_TOKEN_KEY);
        setMessage('Usuario sin permisos de chofer.');
        return;
      }

      setAuthUsername(payload.username);
      setAuthPassword('');
      setAuthToken(payload.accessToken);
      setAuthStatus('authenticated');
      await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, payload.accessToken);
      setMessage(`Sesion iniciada como ${payload.username}.`);
    } catch {
      setMessage('No se pudo iniciar sesion. Verifica credenciales/API.');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    setAuthToken(null);
    setAuthStatus('anonymous');
    setAuthPassword('');
    await AsyncStorage.removeItem(DRIVER_AUTH_TOKEN_KEY);
    setMessage('Sesion cerrada.');
  };

  const loadPendingSales = async () => {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const parsed: PendingSale[] = raw ? JSON.parse(raw) : [];
      const normalized = parsed.map((entry) => ({
        ...entry,
        payload: normalizePendingSalePayload(entry.payload, authUsername, truckCode.trim()),
      }));
      setPendingSales(normalized);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(normalized));
      if (normalized.length > 0) {
        setMessage(`Hay ${normalized.length} ventas pendientes por sincronizar.`);
      }
    } catch {
      setMessage('No se pudo leer la cola offline local.');
    }
  };

  const persistPendingSales = async (next: PendingSale[]) => {
    setPendingSales(next);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  };

  const trySendSale = async (payload: CreateSaleInput): Promise<string> => {
    const token = requireAuthToken();
    if (!token) {
      throw new Error('auth required');
    }

    const response = await fetch(`${API_URL}/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      throw new Error(errorPayload || `API ${response.status}`);
    }

    const saved = await response.json();
    return saved.id as string;
  };

  const enqueueSale = async (payload: CreateSaleInput, cause: string) => {
    const entry: PendingSale = {
      queueId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      payload,
      createdAt: new Date().toISOString(),
      retries: 0,
      nextRetryAt: Date.now(),
      lastError: cause,
    };

    const next = [...pendingSales, entry];
    await persistPendingSales(next);
    setMessage(`Sin conexion. Venta en cola offline (${next.length} pendientes).`);
  };

  const computeBackoff = (retries: number) => {
    const base = 5000;
    return Math.min(base * 2 ** retries, MAX_BACKOFF_MS);
  };

  const refreshDaySummary = async () => {
    const token = requireAuthToken();
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/sales`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const sales: SaleRecord[] = await response.json();
      const today = new Date().toISOString().slice(0, 10);
      const todaySales = sales.filter((sale) => sale.createdAt.slice(0, 10) === today);

      const active = todaySales.filter((sale) => sale.status === 'active');
      const canceled = todaySales.filter((sale) => sale.status === 'canceled');

      setDaySummary({
        activeCount: active.length,
        canceledCount: canceled.length,
        activeTotal: active.reduce((acc, sale) => acc + sale.total, 0),
      });
    } catch {
      // Ignore summary refresh errors to avoid disrupting sales flow.
    }
  };

  const syncPendingSales = async (manual: boolean) => {
    const token = requireAuthToken();
    if (!token) {
      return;
    }

    if (pendingSales.length === 0) {
      if (manual) {
        setMessage('No hay ventas pendientes para sincronizar.');
      }
      return;
    }

    try {
      setSyncing(true);
      let remaining: PendingSale[] = [...pendingSales];
      let synced = 0;
      const now = Date.now();

      for (const entry of pendingSales) {
        if (!manual && entry.nextRetryAt > now) {
          continue;
        }

        try {
          const id = await trySendSale(entry.payload);
          setLastSaleId(id);
          synced += 1;
          remaining = remaining.filter((item) => item.queueId !== entry.queueId);
          await persistPendingSales(remaining);
        } catch (error) {
          const cause = error instanceof Error ? error.message : 'sync error';
          remaining = remaining.map((item) =>
            item.queueId === entry.queueId
              ? {
                  ...item,
                  retries: item.retries + 1,
                  nextRetryAt: Date.now() + computeBackoff(item.retries + 1),
                  lastError: cause,
                }
              : item,
          );
          await persistPendingSales(remaining);
        }
      }

      if (synced > 0 || manual) {
        setMessage(
          `Sincronizacion finalizada. Enviadas: ${synced}. Pendientes: ${remaining.length}.`,
        );
      }
      await refreshDaySummary();
    } finally {
      setSyncing(false);
    }
  };

  const changeQty = (productCode: ProductCode, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, previous[productCode] + delta),
    }));
  };

  const saveSale = async () => {
    setMessage(null);

    const payload: CreateSaleInput = {
      clientGeneratedId: buildClientGeneratedId(),
      driverName: authUsername,
      truckCode: truckCode.trim() || undefined,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
    };

    if (payload.items.length === 0) {
      setMessage('Agrega al menos un producto antes de guardar.');
      return;
    }

    try {
      setSaving(true);

      const saleId = await trySendSale(payload);
      setLastSaleId(saleId);
      setMessage(`Venta guardada correctamente. ID: ${saleId}`);
      setQuantities({ G10: 0, G15: 0, G45: 0, G15_AUTO: 0 });
      await refreshDaySummary();
    } catch (error) {
      const cause =
        error instanceof Error
          ? error.message
          : 'No se pudo guardar en API';
      await enqueueSale(payload, cause);
      setQuantities({ G10: 0, G15: 0, G45: 0, G15_AUTO: 0 });
    } finally {
      setSaving(false);
    }
  };

  const cancelLastSale = async () => {
    const token = requireAuthToken();
    if (!token) {
      return;
    }

    if (!lastSaleId) {
      setMessage('Todavia no hay una venta para anular.');
      return;
    }

    const payload: CancelSaleInput = { reason: cancelReason };
    if (!payload.reason || payload.reason.trim().length < 3) {
      setMessage('El motivo de anulacion debe tener al menos 3 caracteres.');
      return;
    }

    try {
      setCanceling(true);

      const response = await fetch(`${API_URL}/sales/${lastSaleId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.text();
        throw new Error(errorPayload || `API ${response.status}`);
      }

      setMessage('Venta anulada correctamente.');
      setCancelReason('');
      await refreshDaySummary();
    } catch {
      setMessage('No se pudo anular la venta.');
    } finally {
      setCanceling(false);
    }
  };

  const updateLastSale = async () => {
    const token = requireAuthToken();
    if (!token) {
      return;
    }

    if (!lastSaleId) {
      setMessage('Todavia no hay una venta para editar.');
      return;
    }

    const payload: UpdateSaleInput = {
      driverName: authUsername,
      truckCode: truckCode.trim() || undefined,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
      reason: editReason,
    };

    if (!payload.reason || payload.reason.trim().length < 3) {
      setMessage('El motivo de edicion debe tener al menos 3 caracteres.');
      return;
    }

    if (payload.items.length === 0) {
      setMessage('Agrega al menos un producto para editar la venta.');
      return;
    }

    try {
      setUpdating(true);

      const response = await fetch(`${API_URL}/sales/${lastSaleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.text();
        throw new Error(errorPayload || `API ${response.status}`);
      }

      setMessage('Venta editada correctamente.');
      await refreshDaySummary();
    } catch {
      setMessage('No se pudo editar la venta.');
    } finally {
      setUpdating(false);
    }
  };

  const saveExpense = async () => {
    const token = requireAuthToken();
    if (!token) {
      return;
    }

    const payload: CreateExpenseInput = {
      driverName: authUsername,
      category: expenseCategory,
      amount: Number(expenseAmount),
      note: expenseNote || undefined,
      receiptRef: expenseReceiptRef || undefined,
    };

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      setMessage('El monto del gasto debe ser mayor a 0.');
      return;
    }

    try {
      setSavingExpense(true);
      const response = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.text();
        throw new Error(errorPayload || `API ${response.status}`);
      }

      setExpenseAmount('0');
      setExpenseNote('');
      setExpenseReceiptRef('');
      setMessage('Gasto guardado correctamente.');
    } catch {
      setMessage('No se pudo guardar el gasto.');
    } finally {
      setSavingExpense(false);
    }
  };

  const uploadReceipt = async (uri: string) => {
    const token = requireAuthToken();
    if (!token) {
      throw new Error('auth required');
    }

    const form = new FormData();
    form.append('file', {
      uri,
      name: `receipt_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as never);

    const response = await fetch(`${API_URL}/uploads/receipt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      throw new Error(errorPayload || `Upload failed ${response.status}`);
    }

    const payload = (await response.json()) as { url: string };
    return payload.url;
  };

  const pickReceiptImage = async () => {
    try {
      setUploadingReceipt(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage('Permiso de galeria requerido para adjuntar comprobante.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const uploadedUrl = await uploadReceipt(result.assets[0].uri);
      setExpenseReceiptRef(uploadedUrl);
      setMessage('Comprobante cargado correctamente.');
    } catch {
      setMessage('No se pudo subir el comprobante.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const captureReceiptImage = async () => {
    try {
      setUploadingReceipt(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage('Permiso de camara requerido para sacar comprobante.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const uploadedUrl = await uploadReceipt(result.assets[0].uri);
      setExpenseReceiptRef(uploadedUrl);
      setMessage('Comprobante capturado y cargado correctamente.');
    } catch {
      setMessage('No se pudo capturar/subir el comprobante.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  if (authStatus === 'checking') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0369a1" />
          <Text style={styles.apiHint}>Verificando sesion...</Text>
        </View>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.tag}>Distribuidor · App chofer</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Login chofer</Text>
            <TextInput
              style={styles.input}
              value={authUsername}
              onChangeText={setAuthUsername}
              placeholder="Usuario"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder="Password"
              secureTextEntry
              onSubmitEditing={() => void login()}
            />
            <Pressable style={styles.saveButton} onPress={() => void login()} disabled={authLoading}>
              <Text style={styles.saveButtonText}>
                {authLoading ? 'Ingresando...' : 'Iniciar sesion'}
              </Text>
            </Pressable>
          </View>
          {message && <Text style={styles.apiHint}>{message}</Text>}
        </View>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.tag}>Distribuidor · App chofer</Text>
        <Text style={styles.title}>Carga rapida de venta</Text>
        <Text style={styles.subtitle}>Version inicial conectada a API.</Text>

        <View style={styles.card}>
          <Text style={styles.apiHint}>Sesion activa como: {authUsername}</Text>
          <Pressable style={[styles.saveButton, styles.logoutButton]} onPress={() => void logout()}>
            <Text style={styles.saveButtonText}>Cerrar sesion</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Estado de sincronizacion</Text>
          <Text style={styles.apiHint}>Pendientes: {pendingSales.length}</Text>
          {pendingSales.length > 0 && (
            <Text style={styles.apiHint}>
              Proximo intento automatico: {new Date(Math.min(...pendingSales.map((p) => p.nextRetryAt))).toLocaleTimeString('es-AR')}
            </Text>
          )}
          <Pressable
            style={[styles.saveButton, styles.syncButton]}
            onPress={() => void syncPendingSales(true)}
            disabled={syncing}
          >
            <Text style={styles.saveButtonText}>
              {syncing ? 'Sincronizando...' : 'Sincronizar pendientes'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Resumen de jornada</Text>
          <Text style={styles.line}>Ventas activas hoy: {daySummary.activeCount}</Text>
          <Text style={styles.line}>Ventas anuladas hoy: {daySummary.canceledCount}</Text>
          <Text style={styles.total}>Total activo hoy: ${daySummary.activeTotal.toLocaleString('es-AR')}</Text>
          <Pressable
            style={[styles.saveButton, styles.summaryButton]}
            onPress={() => void refreshDaySummary()}
          >
            <Text style={styles.saveButtonText}>Actualizar resumen</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Cliente</Text>
          <Text style={styles.apiHint}>Chofer: {authUsername}</Text>
          <TextInput
            style={styles.input}
            value={truckCode}
            onChangeText={setTruckCode}
            placeholder="Camion / unidad"
          />
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Nombre del cliente"
          />

          <Text style={styles.fieldLabel}>Tipo de cliente</Text>
          <View style={styles.segmentRow}>
            {CUSTOMER_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.segmentButton,
                  customerType === type && styles.segmentActive,
                ]}
                onPress={() => setCustomerType(type)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    customerType === type && styles.segmentTextActive,
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Forma de pago</Text>
          <View style={styles.segmentRow}>
            {PAYMENT_METHODS.map((method) => (
              <Pressable
                key={method}
                style={[
                  styles.segmentButton,
                  paymentMethod === method && styles.segmentActive,
                ]}
                onPress={() => setPaymentMethod(method)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    paymentMethod === method && styles.segmentTextActive,
                  ]}
                >
                  {method}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Productos</Text>
          {PRODUCT_CODES.map((code) => (
            <View key={code} style={styles.productRow}>
              <Text style={styles.productName}>{code}</Text>
              <View style={styles.qtyRow}>
                <Pressable style={styles.qtyButton} onPress={() => changeQty(code, -1)}>
                  <Text style={styles.qtyButtonText}>-</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{quantities[code]}</Text>
                <Pressable style={styles.qtyButton} onPress={() => changeQty(code, 1)}>
                  <Text style={styles.qtyButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.total}>Total: ${total.toLocaleString('es-AR')}</Text>
          <Pressable style={styles.saveButton} onPress={saveSale} disabled={saving}>
            <Text style={styles.saveButtonText}>
              {saving ? 'Guardando...' : 'Guardar venta'}
            </Text>
          </Pressable>
          <Text style={styles.apiHint}>API URL: {API_URL}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Editar ultima venta</Text>
          <Text style={styles.apiHint}>ID ultima venta: {lastSaleId ?? 'sin ventas guardadas'}</Text>
          <TextInput
            style={styles.input}
            value={editReason}
            onChangeText={setEditReason}
            placeholder="Motivo de edicion"
          />
          <Pressable
            style={[styles.saveButton, styles.editButton]}
            onPress={updateLastSale}
            disabled={updating}
          >
            <Text style={styles.saveButtonText}>
              {updating ? 'Actualizando...' : 'Editar ultima venta'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Anular ultima venta</Text>
          <Text style={styles.apiHint}>ID ultima venta: {lastSaleId ?? 'sin ventas guardadas'}</Text>
          <TextInput
            style={styles.input}
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder="Motivo de anulacion"
          />
          <Pressable
            style={[styles.saveButton, styles.cancelButton]}
            onPress={cancelLastSale}
            disabled={canceling}
          >
            <Text style={styles.saveButtonText}>
              {canceling ? 'Anulando...' : 'Anular ultima venta'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Registrar gasto</Text>
          <Text style={styles.apiHint}>Chofer: {authUsername}</Text>

          <Text style={styles.fieldLabel}>Categoria</Text>
          <View style={styles.segmentRow}>
            {EXPENSE_CATEGORIES.map((category) => (
              <Pressable
                key={category}
                style={[
                  styles.segmentButton,
                  expenseCategory === category && styles.segmentActive,
                ]}
                onPress={() => setExpenseCategory(category)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    expenseCategory === category && styles.segmentTextActive,
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={expenseAmount}
            onChangeText={setExpenseAmount}
            placeholder="Monto"
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            value={expenseNote}
            onChangeText={setExpenseNote}
            placeholder="Descripcion (opcional)"
          />
          <TextInput
            style={styles.input}
            value={expenseReceiptRef}
            onChangeText={setExpenseReceiptRef}
            placeholder="Referencia comprobante (opcional)"
          />

          <Pressable
            style={[styles.saveButton, styles.receiptButton]}
            onPress={() => void pickReceiptImage()}
            disabled={uploadingReceipt}
          >
            <Text style={styles.saveButtonText}>
              {uploadingReceipt ? 'Subiendo comprobante...' : 'Adjuntar desde galeria'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.saveButton, styles.cameraButton]}
            onPress={() => void captureReceiptImage()}
            disabled={uploadingReceipt}
          >
            <Text style={styles.saveButtonText}>
              {uploadingReceipt ? 'Subiendo comprobante...' : 'Sacar foto comprobante'}
            </Text>
          </Pressable>

          {expenseReceiptRef.length > 0 && (
            <View style={styles.receiptPreviewWrap}>
              <Text style={styles.apiHint}>Comprobante adjunto:</Text>
              <Image
                source={{ uri: expenseReceiptRef }}
                style={styles.receiptPreview}
                resizeMode="cover"
              />
            </View>
          )}

          <Pressable
            style={[styles.saveButton, styles.expenseButton]}
            onPress={saveExpense}
            disabled={savingExpense}
          >
            <Text style={styles.saveButtonText}>
              {savingExpense ? 'Guardando gasto...' : 'Guardar gasto'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  tag: {
    color: '#0369a1',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 8,
    color: '#334155',
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  segmentButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  segmentActive: {
    backgroundColor: '#0ea5e9',
  },
  segmentText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  card: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 10,
    marginBottom: 14,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
    marginBottom: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  qtyValue: {
    width: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  saveButton: {
    backgroundColor: '#075985',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#b91c1c',
  },
  editButton: {
    backgroundColor: '#1d4ed8',
  },
  syncButton: {
    backgroundColor: '#0f766e',
  },
  summaryButton: {
    backgroundColor: '#374151',
  },
  expenseButton: {
    backgroundColor: '#7c3aed',
  },
  receiptButton: {
    backgroundColor: '#0f766e',
  },
  cameraButton: {
    backgroundColor: '#065f46',
  },
  logoutButton: {
    backgroundColor: '#334155',
  },
  receiptPreviewWrap: {
    gap: 8,
  },
  receiptPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  line: {
    fontSize: 16,
    color: '#0f172a',
  },
  total: {
    fontSize: 24,
    fontWeight: '800',
    color: '#075985',
  },
  apiHint: {
    color: '#64748b',
    fontSize: 12,
  },
  message: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
});
