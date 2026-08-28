import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  PAYMENT_METHODS,
  type CreateSaleInput,
  type CustomerType,
  type PaymentMethod,
  type ProductCode,
  type RecordEmptyVisitInput,
  validateCreateSaleInput,
  validateRecordEmptyVisitInput,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CustomerCard } from '../components/CustomerCard';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ProductRow } from '../components/ProductRow';
import { SaleFooterBar } from '../components/SaleFooterBar';
import { SaleHeader } from '../components/SaleHeader';
import { ScreenContainer } from '../components/ScreenContainer';
import { SegmentedPills } from '../components/SegmentedPills';
import { ToggleRow } from '../components/ToggleRow';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';
import { useCatalog } from '../context/CatalogContext';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { ApiError } from '../services/apiClient';
import { API_URL } from '../services/config';
import { captureDeviceLocation } from '../services/location';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

type NewSaleScreenNavigationProp = NativeStackNavigationProp<NewSaleStackParamList, 'Sale'>;

/**
 * Ya no puede ser una constante con las cuatro claves fijas: el catalogo lo
 * define el admin en runtime. Una cantidad ausente se lee como 0.
 */
const EMPTY_QUANTITIES: Record<ProductCode, number> = {};

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  final: 'Final',
  comercio: 'Comercio',
  distribuidor: 'Distribuidor',
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transf.',
  qr: 'QR',
  tarjeta: 'Tarjeta',
};

const PAYMENT_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PAYMENT_LABELS[method],
}));

const buildClientGeneratedId = () =>
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Carga de una venta, en una sola pantalla con una sola accion.
 *
 * Dos cosas que antes eran campos de este formulario ya no lo son. El nombre
 * del cliente y su tipo salen del padron que administra el admin, nunca de lo
 * que el chofer tipee: el tipo es lo que elige la lista de precios, asi que
 * dejarlo a mano ponia el precio en manos del chofer. Y editar/anular se
 * fueron al historial, donde aplican a la venta que el chofer elige y no a la
 * ultima que quedo en memoria de esta pantalla.
 *
 * La visita sin venta (churn) sobrevive, pero como estado del boton del pie en
 * lugar de una tarjeta aparte: sin productos y con el envase marcado, la unica
 * accion de la pantalla pasa a ser "Registrar devolucion". Sigue siendo el
 * endpoint distinto que siempre fue.
 */
export function NewSaleScreen() {
  const {
    trySendSale,
    enqueueSale,
    trySendEmptyVisit,
    enqueueEmptyVisit,
    refreshDaySummary,
    daySummary,
    pendingSales,
  } = useSync();
  const { username, requireAuthToken } = useAuth();
  const { truck, status: truckStatus, error: truckError } = useTruck();
  const navigation = useNavigation<NewSaleScreenNavigationProp>();
  const route = useRoute<RouteProp<NewSaleStackParamList, 'Sale'>>();

  // `undefined` hasta que el chofer elige un cliente del padron. Sin tipo no
  // hay lista de precios, y por eso tampoco hay total ni venta que guardar.
  const [customerType, setCustomerType] = useState<CustomerType | undefined>(undefined);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const { products, prices, stale: pricesAreStale, canSell } = useCatalog();
  const [quantities, setQuantities] = useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  // `undefined` = nunca tocado (se omite del payload, "no preguntado" en el
  // backend). Solo pasa a true/false cuando el chofer toca el control.
  const [containerReturned, setContainerReturned] = useState<boolean | undefined>(undefined);
  // '' = nunca tocado (se omite del payload, igual criterio que
  // containerReturned). Solo se completa cuando la foto termina de subirse.
  const [paymentProofRef, setPaymentProofRef] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordingVisit, setRecordingVisit] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [lastSale, setLastSale] = useState<{ customerName: string; total: number } | null>(null);

  // Syncs a customer picked in CustomerPickerScreen back into local state
  // (Phase 6 PR2, docs/plans/customer-picker-proximity.md, "Data Flow"):
  // fires whenever navigation returns to this screen with a new
  // pickedCustomer param.
  useEffect(() => {
    const pickedCustomer = route.params?.pickedCustomer;
    if (!pickedCustomer) {
      return;
    }

    setCustomerId(pickedCustomer.id);
    setCustomerName(pickedCustomer.name);
    setCustomerType(pickedCustomer.customerType);
  }, [route.params?.pickedCustomer]);

  const currentItems = useMemo(
    () =>
      products
        .filter((product) => (quantities[product.code] ?? 0) > 0)
        .map((product) => ({
          productCode: product.code,
          quantity: quantities[product.code],
        })),
    [products, quantities],
  );

  // Con los precios que vinieron de la API, no con una tabla compilada dentro
  // de la app. Este era el numero que podia diferir del que grababa el
  // servidor, y con precios editables esa diferencia es plata.
  const total = useMemo(() => {
    if (!prices || !customerType) {
      return 0;
    }
    return currentItems.reduce(
      (sum, item) => sum + (prices[customerType][item.productCode] ?? 0) * item.quantity,
      0,
    );
  }, [customerType, currentItems, prices]);

  const unitPriceOf = (productCode: ProductCode): number | undefined => {
    if (!prices || !customerType) {
      return undefined;
    }
    return prices[customerType][productCode];
  };

  const changeQty = (productCode: ProductCode, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  /**
   * Adaptado de ExpensesScreen.pickReceiptImage/captureReceiptImage/
   * uploadReceipt: mismo mecanismo (`/uploads/receipt`, reusado sin cambios
   * por decision del roadmap), mismo patron de estado local. Solo se
   * renderiza cuando paymentMethod !== 'efectivo'.
   */
  const uploadPaymentProof = async (uri: string) => {
    // Uses expo-file-system's File.upload() (native multipart task) instead
    // of building a JS FormData -- the RN {uri,name,type} FormData shorthand
    // throws "Unsupported FormDataPart implementation", and reconstructing a
    // Blob from the file's bytes throws "Creating blobs from 'ArrayBuffer'
    // ... are not supported" on this RN/Expo version. File.upload() bypasses
    // both by handling the multipart encoding natively.
    const localFile = new File(uri);
    const token = requireAuthToken();
    const result = await localFile.upload(`${API_URL}/uploads/receipt`, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'image/jpeg',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(result.status, result.body || `API ${result.status}`);
    }

    const uploaded = JSON.parse(result.body) as { url: string };
    return uploaded.url;
  };

  const pickPaymentProofImage = async () => {
    try {
      setUploadingProof(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de galeria requerido para adjuntar el comprobante.', 'error');
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

      const uploadedUrl = await uploadPaymentProof(result.assets[0].uri);
      setPaymentProofRef(uploadedUrl);
      showMessage('Comprobante de pago cargado correctamente.', 'success');
    } catch {
      showMessage('No se pudo subir el comprobante de pago.', 'error');
    } finally {
      setUploadingProof(false);
    }
  };

  const capturePaymentProofImage = async () => {
    try {
      setUploadingProof(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de camara requerido para sacar el comprobante.', 'error');
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

      const uploadedUrl = await uploadPaymentProof(result.assets[0].uri);
      setPaymentProofRef(uploadedUrl);
      showMessage('Comprobante de pago capturado y cargado correctamente.', 'success');
    } catch {
      showMessage('No se pudo capturar/subir el comprobante de pago.', 'error');
    } finally {
      setUploadingProof(false);
    }
  };

  /** Deja la pantalla lista para la proxima venta sin perder el cliente. */
  const resetAfterSale = () => {
    setQuantities(EMPTY_QUANTITIES);
    setContainerReturned(undefined);
    setPaymentProofRef('');
  };

  const saveSale = async () => {
    setMessage(null);

    // Sin camion asignado la venta quedaria sin unidad: se corta antes de
    // mandarla o encolarla (y antes de pedir el permiso de ubicacion, que no
    // tendria sentido pedir si la venta ni siquiera va a intentarse).
    if (!truck) {
      showMessage('No podes cargar ventas sin un camion asignado para hoy.', 'error');
      return;
    }

    if (!customerType) {
      showMessage('Elegi un cliente antes de guardar la venta.', 'error');
      return;
    }

    if (currentItems.length === 0) {
      showMessage('Agrega al menos un producto antes de guardar.', 'error');
      return;
    }

    // Punto en el tiempo (point-in-time-geolocation): se captura aca, justo
    // antes de armar el payload final, no al montar la pantalla -- ver el
    // comentario de captureDeviceLocation (services/location.ts).
    const location = await captureDeviceLocation();

    const payload: CreateSaleInput = {
      clientGeneratedId: buildClientGeneratedId(),
      // Cuando ocurre la venta, que es lo unico que este telefono sabe y el
      // servidor no: si la venta se encola, va a llegar horas o dias despues.
      // De esta fecha depende a que precio se graba y en que dia se cuenta.
      occurredAt: new Date().toISOString(),
      driverName: username,
      truckId: truck.truckId,
      truckCode: truck.code,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
      // Omitido (no la key) si el chofer nunca toco el control -- "no
      // preguntado", no "false".
      ...(containerReturned !== undefined ? { containerReturned } : {}),
      // Omitido (no la key) si nunca se subio una foto -- mismo criterio que
      // containerReturned, no un string vacio.
      ...(paymentProofRef ? { paymentProofRef } : {}),
      // Omitido (no las keys) si no hubo lectura exitosa -- permiso denegado,
      // sin fix de GPS, o timeout, mismo criterio que arriba.
      ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      // Omitido (no la key) si no hay cliente del padron detras.
      ...(customerId ? { customerId } : {}),
    };

    // Reuses the shared validator instead of hand-rolling a customerName
    // check: catches a blank/whitespace-only name client-side, before it
    // either hits the API (400) or, worse, gets stuck forever in the
    // offline sync queue with no remediation UI.
    const validationErrors = validateCreateSaleInput(payload);
    if (validationErrors.length > 0) {
      showMessage(validationErrors[0], 'error');
      return;
    }

    const soldTotal = total;

    try {
      setSaving(true);
      await trySendSale(payload);
      setLastSale({ customerName, total: soldTotal });
      resetAfterSale();
      await refreshDaySummary();
      // El resultado se cuenta en su propia pantalla, no en una linea de
      // banner: "el servidor la tiene" y "sigue en el telefono" son dos
      // desenlaces distintos, y confundirlos hace que el chofer cargue la
      // misma venta dos veces.
      navigation.navigate('SaleResult', {
        outcome: 'sent',
        customerName,
        total: soldTotal,
        paymentMethod,
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo guardar en API';
      await enqueueSale(payload, cause);
      setLastSale({ customerName, total: soldTotal });
      resetAfterSale();
      navigation.navigate('SaleResult', {
        outcome: 'queued',
        customerName,
        total: soldTotal,
        paymentMethod,
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Accion deliberadamente separada de saveSale: registra una visita sin
   * venta (envase devuelto, nada entregado). NO requiere items ni forma de
   * pago -- RecordEmptyVisitInput ni siquiera tiene esos campos. Reusa el
   * mismo mecanismo online-primero-despues-cola que saveSale
   * (trySendEmptyVisit/enqueueEmptyVisit, gemelos de trySendSale/enqueueSale
   * en SyncContext) para que tambien funcione sin señal.
   */
  const recordVisit = async () => {
    setMessage(null);

    if (!truck) {
      showMessage('No podes registrar visitas sin un camion asignado para hoy.', 'error');
      return;
    }

    if (!customerType) {
      showMessage('Elegi un cliente antes de registrar la visita.', 'error');
      return;
    }

    const payload: RecordEmptyVisitInput = {
      clientGeneratedId: buildClientGeneratedId(),
      occurredAt: new Date().toISOString(),
      driverName: username,
      truckId: truck.truckId,
      truckCode: truck.code,
      customerName,
      customerType,
      ...(customerId ? { customerId } : {}),
    };

    const validationErrors = validateRecordEmptyVisitInput(payload);
    if (validationErrors.length > 0) {
      showMessage(validationErrors[0], 'error');
      return;
    }

    try {
      setRecordingVisit(true);
      const visitId = await trySendEmptyVisit(payload);
      // Copia deliberadamente distinta de la de una venta normal: el chofer
      // no debe confundir esto con "vendi algo".
      showMessage(`Visita sin venta registrada. ID: ${visitId}`, 'success');
      resetAfterSale();
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo registrar la visita';
      const queueLength = await enqueueEmptyVisit(payload, cause);
      showMessage(
        `Sin conexion. Visita sin venta en cola offline (${queueLength} pendientes).`,
        'warning',
      );
      resetAfterSale();
    } finally {
      setRecordingVisit(false);
    }
  };

  /**
   * La pantalla tiene una sola accion, y su texto es lo que explica por que
   * no esta disponible. Un boton gris sin motivo deja al chofer sin saber que
   * le falta; cada rama de aca nombra exactamente lo que hay que resolver.
   */
  const footerAction = useMemo(() => {
    if (saving) {
      return { label: 'Guardando...', disabled: true, run: () => {} };
    }
    if (recordingVisit) {
      return { label: 'Registrando...', disabled: true, run: () => {} };
    }
    if (!canSell) {
      return { label: 'Sin precios — sincronizá', disabled: true, run: () => {} };
    }
    if (!truck) {
      return { label: 'Sin camión asignado', disabled: true, run: () => {} };
    }
    if (!customerName) {
      return { label: 'Elegí un cliente', disabled: true, run: () => {} };
    }
    if (currentItems.length === 0) {
      // Envase marcado y nada vendido es exactamente una visita sin venta:
      // el chofer paso, le devolvieron el envase, no compro. Fila churn, no
      // una venta en cero.
      if (containerReturned === true) {
        return {
          label: 'Registrar devolución',
          disabled: false,
          run: () => void recordVisit(),
        };
      }
      return { label: 'Agregá productos', disabled: true, run: () => {} };
    }
    return { label: 'Guardar venta', disabled: false, run: () => void saveSale() };
  }, [
    saving,
    recordingVisit,
    canSell,
    truck,
    customerName,
    currentItems.length,
    containerReturned,
    saveSale,
    recordVisit,
  ]);

  const containerSubtitle =
    containerReturned === undefined ? 'Sin marcar' : containerReturned ? 'Devuelto' : 'No devolvió';

  return (
    <ScreenContainer
      testID="new-sale-screen"
      scroll
      footer={
        <SaleFooterBar
          total={total}
          actionLabel={footerAction.label}
          onPress={footerAction.run}
          disabled={footerAction.disabled}
        />
      }
    >
      <SaleHeader
        testID="new-sale-header"
        saleNumber={daySummary.activeCount + 1}
        truckCode={truck?.code}
        queuedCount={pendingSales.length}
      />

      {!truck && truckStatus === 'error' && (
        <FeedbackBanner
          testID="new-sale-truck-error"
          message={`${truckError} Revisa la conexion y volve a intentar.`}
          tone="error"
        />
      )}
      {!truck && truckStatus !== 'error' && truckStatus !== 'loading' && (
        <FeedbackBanner
          testID="new-sale-no-truck"
          message="Hoy no tenes un camion asignado. Hablá con el administrador antes de cargar ventas."
          tone="error"
        />
      )}
      {pricesAreStale && (
        <FeedbackBanner
          testID="new-sale-stale-prices"
          message="Sin conexion: precios de la ultima vez que sincronizaste. Pueden estar desactualizados."
          tone="warning"
        />
      )}

      <CustomerCard
        testID="new-sale-customer-card"
        name={customerName || undefined}
        subtitle={customerType ? CUSTOMER_TYPE_LABELS[customerType] : undefined}
        onPress={() => navigation.navigate('CustomerPicker')}
      />

      <View style={styles.products}>
        {products.map((product) => (
          <ProductRow
            key={product.code}
            code={product.code}
            name={product.name}
            unitPrice={unitPriceOf(product.code)}
            quantity={quantities[product.code] ?? 0}
            onIncrement={() => changeQty(product.code, 1)}
            onDecrement={() => changeQty(product.code, -1)}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>COBRO</Text>
      <SegmentedPills
        options={PAYMENT_OPTIONS}
        value={paymentMethod}
        onChange={setPaymentMethod}
        testID="new-sale-payment"
      />

      {paymentMethod !== 'efectivo' && (
        <View style={styles.proof}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>COMPROBANTE</Text>
            <Text style={styles.optional}>opcional</Text>
          </View>
          <View style={styles.proofButtons}>
            <View style={styles.proofButton}>
              <Button
                label={uploadingProof ? 'Subiendo...' : 'Sacar foto'}
                variant="secondary"
                onPress={() => void capturePaymentProofImage()}
                disabled={uploadingProof}
                testID="new-sale-payment-proof-capture-camera"
              />
            </View>
            <View style={styles.proofButton}>
              <Button
                label={uploadingProof ? 'Subiendo...' : 'Galería'}
                variant="secondary"
                onPress={() => void pickPaymentProofImage()}
                disabled={uploadingProof}
                testID="new-sale-payment-proof-pick-gallery"
              />
            </View>
          </View>
          {paymentProofRef.length > 0 && (
            <Card>
              <Text style={styles.hint}>Comprobante adjunto:</Text>
              <Image
                source={{ uri: paymentProofRef }}
                style={styles.receiptPreview}
                resizeMode="cover"
              />
            </Card>
          )}
        </View>
      )}

      <ToggleRow
        label="Envase devuelto"
        subtitle={containerSubtitle}
        value={containerReturned === true}
        onValueChange={setContainerReturned}
        testID="new-sale-container-returned"
      />

      {lastSale && (
        <Text style={styles.lastSale} testID="new-sale-last-sale">
          Última: {lastSale.customerName} · {formatArs(lastSale.total)}
        </Text>
      )}

      <FeedbackBanner message={message} tone={messageTone} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  products: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.7,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  optional: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  proof: {
    gap: spacing.sm,
  },
  proofButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  proofButton: {
    flex: 1,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  receiptPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
  lastSale: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
