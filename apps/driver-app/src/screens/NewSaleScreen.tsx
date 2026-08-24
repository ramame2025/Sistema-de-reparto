import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  CUSTOMER_TYPES,
  DEFAULT_PRICE_TABLE,
  PAYMENT_METHODS,
  PRODUCT_CODES,
  calculateSaleTotal,
  type CreateSaleInput,
  type CustomerType,
  type PaymentMethod,
  type ProductCode,
  type RecordEmptyVisitInput,
  type SaleRecord,
  type UpdateSaleInput,
  validateCreateSaleInput,
  validateRecordEmptyVisitInput,
  validateUpdateSaleInput,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { ApiError } from '../services/apiClient';
import { API_URL } from '../services/config';
import { captureDeviceLocation } from '../services/location';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type NewSaleScreenNavigationProp = NativeStackNavigationProp<NewSaleStackParamList, 'Sale'>;

const EMPTY_QUANTITIES: Record<ProductCode, number> = {
  G10: 0,
  G15: 0,
  G45: 0,
  G15_AUTO: 0,
};

const buildClientGeneratedId = () =>
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

type SegmentButtonProps<T extends string> = {
  label: T;
  active: boolean;
  onPress: () => void;
};

function SegmentButton<T extends string>({ label, active, onPress }: SegmentButtonProps<T>) {
  return <Button label={label} variant={active ? 'primary' : 'secondary'} onPress={onPress} />;
}

/**
 * Relocated verbatim from the pre-PR5 App.tsx "Cliente"/"Productos"/save/
 * "Editar ultima venta"/"Anular ultima venta" cards. El camion ya no se tipea:
 * sale de `TruckContext`, que resuelve la asignacion vigente del chofer para
 * hoy, y sin camion la pantalla no deja cargar ventas. Cancel/edit now go through
 * `AuthContext.api` directly (design's NewSaleScreen consumer contract)
 * instead of raw `fetch`. No field/validation/copy redesign — only the
 * transport (context hooks + shared components) changed.
 */
export function NewSaleScreen() {
  const { trySendSale, enqueueSale, trySendEmptyVisit, enqueueEmptyVisit, refreshDaySummary } =
    useSync();
  const { api, username, requireAuthToken } = useAuth();
  const { truck, status: truckStatus, error: truckError } = useTruck();
  const navigation = useNavigation<NewSaleScreenNavigationProp>();
  const route = useRoute<RouteProp<NewSaleStackParamList, 'Sale'>>();

  const [customerType, setCustomerType] = useState<CustomerType>('final');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [customerName, setCustomerName] = useState('');
  // Set only when a customer was picked via CustomerPickerScreen (Phase 6
  // PR2, docs/plans/customer-picker-proximity.md design decision #7: params
  // returned via navigation.navigate, no shared Context). Cleared the
  // instant customerName is hand-edited afterward (design decision #9) --
  // resolveCustomerAndTruck (apps/api/src/sales/sales.service.ts) silently
  // overrides customerName/customerType from the stored Customer row
  // whenever customerId is present, so an un-cleared customerId here would
  // discard the driver's edit server-side without any visible error.
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [quantities, setQuantities] = useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  // `undefined` = nunca tocado (se omite del payload, "no preguntado" en el
  // backend). Solo pasa a true/false cuando el chofer toca el control.
  const [containerReturned, setContainerReturned] = useState<boolean | undefined>(undefined);
  // '' = nunca tocado (se omite del payload, igual criterio que
  // containerReturned). Solo se completa cuando la foto termina de subirse.
  const [paymentProofRef, setPaymentProofRef] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editReason, setEditReason] = useState('Correccion de carga');
  const [canceling, setCanceling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [recordingVisit, setRecordingVisit] = useState(false);

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

  const onChangeCustomerName = (value: string) => {
    setCustomerName(value);
    // Closes the silent-discard trap documented above: an edit made after a
    // pick must not still carry the stale customerId into the payload.
    if (customerId) {
      setCustomerId(undefined);
    }
  };

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

  const changeQty = (productCode: ProductCode, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, previous[productCode] + delta),
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
   * renderiza cuando paymentMethod !== 'efectivo' (Open Question 2).
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

  const saveSale = async () => {
    setMessage(null);

    // Sin camion asignado la venta quedaria sin unidad: se corta antes de
    // mandarla o encolarla (y antes de pedir el permiso de ubicacion, que no
    // tendria sentido pedir si la venta ni siquiera va a intentarse).
    if (!truck) {
      showMessage('No podes cargar ventas sin un camion asignado para hoy.', 'error');
      return;
    }

    if (currentItems.length === 0) {
      showMessage('Agrega al menos un producto antes de guardar.', 'error');
      return;
    }

    // Punto en el tiempo (point-in-time-geolocation): se captura aca, justo
    // antes de armar el payload final, no al montar la pantalla -- ver el
    // comentario de captureDeviceLocation (services/location.ts). Fase 6 PR3
    // extrajo esta funcion de aca (era inline, captureSaleLocation) para que
    // CustomerPickerScreen tambien pueda usarla sin duplicar la logica.
    const location = await captureDeviceLocation();

    const payload: CreateSaleInput = {
      clientGeneratedId: buildClientGeneratedId(),
      driverName: username,
      truckId: truck.truckId,
      truckCode: truck.code,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
      // Omitido (no la key) si el chofer nunca toco el control -- "no
      // preguntado" segun Open Question 1 del plan, no "false".
      ...(containerReturned !== undefined ? { containerReturned } : {}),
      // Omitido (no la key) si nunca se subio una foto -- mismo criterio que
      // containerReturned, no un string vacio.
      ...(paymentProofRef ? { paymentProofRef } : {}),
      // Omitido (no las keys) si no hubo lectura exitosa -- permiso denegado,
      // sin fix de GPS, o timeout, mismo criterio que arriba.
      ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      // Omitido (no la key) si nunca se eligio un cliente del picker, o si
      // customerId se limpio por una edicion manual posterior -- mismo
      // criterio condicional que los campos de arriba.
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

    try {
      setSaving(true);
      const saleId = await trySendSale(payload);
      setLastSaleId(saleId);
      showMessage(`Venta guardada correctamente. ID: ${saleId}`, 'success');
      setQuantities(EMPTY_QUANTITIES);
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo guardar en API';
      const queueLength = await enqueueSale(payload, cause);
      showMessage(`Sin conexion. Venta en cola offline (${queueLength} pendientes).`, 'warning');
      setQuantities(EMPTY_QUANTITIES);
    } finally {
      setSaving(false);
    }
  };

  const cancelLastSale = async () => {
    if (!lastSaleId) {
      showMessage('Todavia no hay una venta para anular.', 'error');
      return;
    }

    if (!cancelReason || cancelReason.trim().length < 3) {
      showMessage('El motivo de anulacion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    try {
      setCanceling(true);
      await api.patch<SaleRecord>(`/sales/${lastSaleId}/cancel`, { reason: cancelReason });
      showMessage('Venta anulada correctamente.', 'success');
      setCancelReason('');
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo anular la venta.';
      showMessage(cause, 'error');
    } finally {
      setCanceling(false);
    }
  };

  const updateLastSale = async () => {
    if (!lastSaleId) {
      showMessage('Todavia no hay una venta para editar.', 'error');
      return;
    }

    if (!editReason || editReason.trim().length < 3) {
      showMessage('El motivo de edicion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    const payload: UpdateSaleInput = {
      driverName: username,
      truckId: truck?.truckId,
      truckCode: truck?.code,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
      reason: editReason,
      // Bug fix (driver-ux-polish): saveSale's payload already spreads
      // customerId conditionally -- this one didn't, so editing a sale
      // linked to a Customer silently dropped that link on every edit
      // (the API's resolveCustomerAndTruck treats customerId === undefined
      // as "clear the link").
      ...(customerId ? { customerId } : {}),
    };

    if (payload.items.length === 0) {
      showMessage('Agrega al menos un producto para editar la venta.', 'error');
      return;
    }

    const validationErrors = validateUpdateSaleInput(payload);
    if (validationErrors.length > 0) {
      showMessage(validationErrors[0], 'error');
      return;
    }

    try {
      setUpdating(true);
      await api.patch<SaleRecord>(`/sales/${lastSaleId}`, payload);
      showMessage('Venta editada correctamente.', 'success');
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo editar la venta.';
      showMessage(cause, 'error');
    } finally {
      setUpdating(false);
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

    const payload: RecordEmptyVisitInput = {
      clientGeneratedId: buildClientGeneratedId(),
      driverName: username,
      truckId: truck?.truckId,
      truckCode: truck?.code,
      customerName,
      customerType,
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
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo registrar la visita';
      const queueLength = await enqueueEmptyVisit(payload, cause);
      showMessage(
        `Sin conexion. Visita sin venta en cola offline (${queueLength} pendientes).`,
        'warning',
      );
    } finally {
      setRecordingVisit(false);
    }
  };

  return (
    <ScreenContainer testID="new-sale-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Cliente</Text>
        <Text style={styles.apiHint}>Chofer: {username}</Text>
        {truck && (
          <Text style={styles.assignedTruck} testID="new-sale-assigned-truck">
            Camion: {truck.code} · {truck.plate} · {truck.capacity} u.
            {truck.kind === 'cobertura' ? ' (cobertura)' : ''}
          </Text>
        )}
        {!truck && truckStatus === 'error' && (
          <Text style={styles.truckProblem} testID="new-sale-truck-error">
            {truckError} Revisa la conexion y volve a intentar.
          </Text>
        )}
        {!truck && truckStatus !== 'error' && truckStatus !== 'loading' && (
          <Text style={styles.truckProblem} testID="new-sale-no-truck">
            Hoy no tenes un camion asignado. Hablá con el administrador antes de
            cargar ventas.
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={customerName}
          onChangeText={onChangeCustomerName}
          placeholder="Nombre del cliente"
        />
        <Button
          label="Elegir cliente"
          variant="secondary"
          onPress={() => navigation.navigate('CustomerPicker')}
          testID="new-sale-pick-customer-button"
        />

        <Text style={styles.fieldLabel}>Tipo de cliente</Text>
        <View style={styles.segmentRow}>
          {CUSTOMER_TYPES.map((type) => (
            <SegmentButton
              key={type}
              label={type}
              active={customerType === type}
              onPress={() => setCustomerType(type)}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Forma de pago</Text>
        <View style={styles.segmentRow}>
          {PAYMENT_METHODS.map((method) => (
            <SegmentButton
              key={method}
              label={method}
              active={paymentMethod === method}
              onPress={() => setPaymentMethod(method)}
            />
          ))}
        </View>

        {paymentMethod !== 'efectivo' && (
          <View style={styles.paymentProofWrap}>
            <Text style={styles.fieldLabel}>Comprobante de pago (opcional)</Text>
            <Button
              label={uploadingProof ? 'Subiendo comprobante...' : 'Adjuntar desde galeria'}
              variant="secondary"
              onPress={() => void pickPaymentProofImage()}
              disabled={uploadingProof}
              testID="new-sale-payment-proof-pick-gallery"
            />
            <Button
              label={uploadingProof ? 'Subiendo comprobante...' : 'Sacar foto comprobante'}
              variant="secondary"
              onPress={() => void capturePaymentProofImage()}
              disabled={uploadingProof}
              testID="new-sale-payment-proof-capture-camera"
            />
            {paymentProofRef.length > 0 && (
              <View style={styles.receiptPreviewWrap}>
                <Text style={styles.apiHint}>Comprobante adjunto:</Text>
                <Image
                  source={{ uri: paymentProofRef }}
                  style={styles.receiptPreview}
                  resizeMode="cover"
                />
              </View>
            )}
          </View>
        )}

        <Text style={styles.fieldLabel}>Envase</Text>
        <Button
          label={`Envase devuelto: ${
            containerReturned === undefined ? 'sin marcar' : containerReturned ? 'si' : 'no'
          }`}
          variant={containerReturned ? 'primary' : 'secondary'}
          onPress={() => setContainerReturned((previous) => !(previous ?? false))}
          testID="new-sale-container-returned-toggle"
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Productos</Text>
        {PRODUCT_CODES.map((code) => (
          <View key={code} style={styles.productRow}>
            <Text style={styles.productName}>{code}</Text>
            <View style={styles.qtyRow}>
              <Button
                label="-"
                variant="secondary"
                onPress={() => changeQty(code, -1)}
                testID={`new-sale-qty-decrement-${code}`}
              />
              <Text style={styles.qtyValue}>{quantities[code]}</Text>
              <Button
                label="+"
                variant="secondary"
                onPress={() => changeQty(code, 1)}
                testID={`new-sale-qty-increment-${code}`}
              />
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.total}>Total: ${total.toLocaleString('es-AR')}</Text>
        <Button
          label={saving ? 'Guardando...' : 'Guardar venta'}
          onPress={() => void saveSale()}
          disabled={saving}
        />
        <FeedbackBanner message={message} tone={messageTone} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Visita sin venta</Text>
        <Text style={styles.apiHint}>
          Para cuando el cliente devuelve el envase pero no compra nada. No
          necesita productos cargados -- es una accion distinta de guardar
          una venta.
        </Text>
        <Button
          label={recordingVisit ? 'Registrando...' : 'Registrar visita sin venta'}
          variant="secondary"
          onPress={() => void recordVisit()}
          disabled={recordingVisit}
          testID="new-sale-record-visit-button"
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Editar ultima venta</Text>
        <Text style={styles.apiHint}>
          ID ultima venta: {lastSaleId ?? 'sin ventas guardadas'}
        </Text>
        <TextInput
          style={styles.input}
          value={editReason}
          onChangeText={setEditReason}
          placeholder="Motivo de edicion"
        />
        <Button
          label={updating ? 'Actualizando...' : 'Editar ultima venta'}
          variant="secondary"
          onPress={() => void updateLastSale()}
          disabled={updating}
          testID="new-sale-edit-button"
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Anular ultima venta</Text>
        <Text style={styles.apiHint}>
          ID ultima venta: {lastSaleId ?? 'sin ventas guardadas'}
        </Text>
        <TextInput
          style={styles.input}
          value={cancelReason}
          onChangeText={setCancelReason}
          placeholder="Motivo de anulacion"
        />
        <Button
          label={canceling ? 'Anulando...' : 'Anular ultima venta'}
          variant="secondary"
          onPress={() => void cancelLastSale()}
          disabled={canceling}
          testID="new-sale-cancel-button"
        />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  assignedTruck: {
    fontWeight: '600',
    marginBottom: 8,
  },
  truckProblem: {
    marginBottom: 8,
  },
  apiHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paymentProofWrap: {
    gap: spacing.sm,
  },
  receiptPreviewWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  receiptPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  productName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  total: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
});
