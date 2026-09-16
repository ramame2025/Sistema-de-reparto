import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  type PaymentMethod,
  type SaleRecord,
  type UpdateSaleInput,
  splitSaleItems,
  validateUpdateSaleInput,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { useKeyboardAwareField } from '../components/KeyboardAwareField';
import { ProductRow } from '../components/ProductRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionLabel } from '../components/SectionLabel';
import { SegmentedPills } from '../components/SegmentedPills';
import { TextField } from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import {
  driverErrorMessage,
  paymentMethodLabel,
  proofPolicyOf,
} from '../services/paymentMethods';
import { useSync } from '../context/SyncContext';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { ApiError } from '../services/apiClient';
import { API_URL } from '../services/config';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

type SaleDetailNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'SaleDetail'>;

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  final: 'Final',
  comercio: 'Comercio',
  distribuidor: 'Distribuidor',
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Device-local date+time, same philosophy as TruckContext.localDay. */
const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

/**
 * Edit and cancel, moved off NewSaleScreen and onto one concrete sale.
 *
 * The old placement could only ever act on `lastSaleId`, a variable held in
 * memory by the New Sale screen: closing the app made every sale of the day
 * unfixable, and an edit shipped whatever happened to be typed into that
 * form at the time rather than the sale's own contents. Here both actions
 * are bound to the row the driver opened, prefilled from that row.
 *
 * The record arrives as a navigation param straight from the history list,
 * which already fetched it in full — no second round trip for data the app
 * is already holding.
 */
export function SaleDetailScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<RouteProp<HomeStackParamList, 'SaleDetail'>>();
  const navigation = useNavigation<SaleDetailNavigationProp>();
  const { api, username, requireAuthToken } = useAuth();
  const { refreshDaySummary } = useSync();

  const sale = route.params.sale;
  const isChurn = sale.kind === 'churn';
  const isSwap = sale.kind === 'swap';
  const isCanceled = sale.status === 'canceled';
  const isEditable = !isCanceled && !isChurn;

  // Lo que volvio, separado por motivo. Una fallada y un envase vacio no son
  // lo mismo: la primera se cambio por una unidad nueva y el segundo volvio
  // sin nada a cambio, y por eso se editan distinto.
  const faultyItems = useMemo(
    () => (sale.returnItems ?? []).filter((item) => item.reason === 'faulty'),
    [sale.returnItems],
  );
  const emptyItems = useMemo(
    () => (sale.returnItems ?? []).filter((item) => item.reason === 'empty'),
    [sale.returnItems],
  );

  /**
   * Lo que salio del camion, partido en las dos cosas que `sale.items` trae
   * mezcladas: lo VENDIDO, que se cobra y se edita como producto, y el
   * REEMPLAZO de un cambio por falla, que salio sin cargo y se mueve junto con
   * la fallada que volvio.
   *
   * Sin esta particion una visita mixta no se puede editar: el payload
   * necesita las dos listas por separado -- `items` y `swappedItems` -- y
   * mandar el reemplazo dentro de `items` haria que la API lo cobrara como si
   * se hubiera vendido.
   *
   * Una fila de `kind: 'swap'` se saltea la particion a proposito: ahi TODA
   * linea es un reemplazo por definicion, y leerla asi es lo que hace que un
   * cambio grabado antes de que existiera la bandera se siga viendo entero.
   */
  const { soldItems, replacementItems } = useMemo(() => {
    if (isSwap) {
      return { soldItems: [], replacementItems: sale.items };
    }
    return splitSaleItems(sale.items);
  }, [isSwap, sale.items]);

  // Unit prices come from the sale itself, never from today's price table:
  // re-pricing a March sale at August's rates is exactly what the API's
  // `getPriceTableAt(existing.occurredAt)` refuses to do server-side.
  const unitPrices = useMemo(() => {
    const table: Record<string, number> = {};
    sale.items.forEach((item) => {
      table[item.productCode] = item.unitPrice;
    });
    return table;
  }, [sale.items]);

  // Solo lo vendido: el reemplazo de un cambio no es un producto que el chofer
  // edite por aca, y meterlo en este estado lo cobraria al guardar.
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    soldItems.forEach((item) => {
      initial[item.productCode] = item.quantity;
    });
    return initial;
  });
  // Arranca en el medio con el que la venta se cobro. Si esa venta es de
  // churn no hay medio que editar y la pantalla no muestra el selector, asi
  // que el `undefined` no llega a verse.
  const { paymentMethods } = useCatalog();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>(
    sale.paymentMethod ?? undefined,
  );
  /**
   * Las cantidades de un cambio por falla, en UN solo estado.
   *
   * La unidad de reemplazo que salio del camion y la fallada que volvio son el
   * mismo numero (D6b): con dos estados podrian discrepar, y el 1 a 1 se
   * rompe. Las dos listas de la pantalla escriben aca, asi que el chofer puede
   * tocar el lado que le quede mas a mano y los dos se mueven juntos.
   */
  const [swapQuantities, setSwapQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    faultyItems.forEach((item) => {
      initial[item.productCode] = item.quantity;
    });
    return initial;
  });
  const [editReason, setEditReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachingProof, setAttachingProof] = useState(false);
  const [proofRef, setProofRef] = useState(sale.paymentProofRef);
  const [canceling, setCanceling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  // Los dos motivos viven al fondo de la pantalla, debajo de los productos.
  const editReasonField = useKeyboardAwareField();
  const cancelReasonField = useKeyboardAwareField();

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  // A product taken down to zero leaves the sale entirely: the API replaces
  // the item set wholesale, so a `quantity: 0` line would be a validation
  // error rather than a removal.
  const editedItems = useMemo(
    () =>
      soldItems
        .filter((item) => (quantities[item.productCode] ?? 0) > 0)
        .map((item) => ({
          productCode: item.productCode,
          quantity: quantities[item.productCode],
        })),
    [soldItems, quantities],
  );

  const total = useMemo(
    () =>
      editedItems.reduce(
        (sum, item) => sum + (unitPrices[item.productCode] ?? 0) * item.quantity,
        0,
      ),
    [editedItems, unitPrices],
  );

  const paymentOptions = useMemo(
    () =>
      paymentMethods.map((method) => ({
        value: method.code,
        label: method.name,
      })),
    [paymentMethods],
  );

  // La regla del comprobante se lee del medio con el que la venta se COBRO, no
  // del que este seleccionado en el editor: el aviso habla de lo que ya pasó.
  const saleProofPolicy = proofPolicyOf(paymentMethods, sale.paymentMethod);
  const saleMethodLabel = paymentMethodLabel(
    paymentMethods,
    sale.paymentMethod,
    'Esta venta',
  );

  const changeQty = (productCode: string, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  const changeSwapQty = (productCode: string, delta: number) => {
    setSwapQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  /**
   * El cambio tal como viaja: una sola lista. El servidor deriva de ella los
   * dos lados -- el `SaleItem` de reemplazo y el `SaleReturnItem` fallado --
   * asi que no hay forma de que una edicion los deje en numeros distintos.
   */
  const editedSwappedItems = useMemo(
    () =>
      Object.entries(swapQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productCode, quantity]) => ({ productCode, quantity })),
    [swapQuantities],
  );

  /**
   * Si esta visita tiene un lado de cambio que la edicion pueda mover.
   *
   * Decide si `swappedItems` viaja en el payload, y la ausencia importa: la
   * API deja quietas las filas de retorno que el payload no nombra. Una venta
   * sin falladas no manda la lista, asi que no puede borrar nada; una que si
   * las tiene la manda siempre -- incluso vacia -- porque bajarlas a cero es
   * una edicion legitima que tiene que llegar.
   */
  const hasSwapSide = isSwap || faultyItems.length > 0 || replacementItems.length > 0;

  const saveEdit = async () => {
    setMessage(null);

    if (!editReason || editReason.trim().length < 3) {
      showMessage('El motivo de edicion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    if (isSwap && editedSwappedItems.length === 0) {
      showMessage('El cambio tiene que quedar con al menos una unidad.', 'error');
      return;
    }

    if (!isSwap && editedItems.length === 0) {
      showMessage('La venta tiene que quedar con al menos un producto.', 'error');
      return;
    }

    // Una venta editable siempre se cobro con algo, asi que en la practica
    // esto no se dispara; esta para que el payload no pueda salir sin medio de
    // pago si esa premisa cambia. Un cambio nunca cobro, asi que no aplica.
    if (!isSwap && !paymentMethod) {
      showMessage('Elegi un medio de pago antes de guardar.', 'error');
      return;
    }

    const payload: UpdateSaleInput = {
      driverName: username,
      truckCode: sale.truckCode,
      customerName: sale.customerName,
      customerType: sale.customerType,
      // Una fila de cambio no tiene medio de pago que conservar: viaja vacio
      // porque el tipo exige la clave, y el servidor lo fuerza a null igual.
      paymentMethod: isSwap ? (sale.paymentMethod ?? '') : (paymentMethod as PaymentMethod),
      // En un cambio el numero viaja UNA sola vez, en `swappedItems`: el
      // servidor deriva de ahi la unidad de reemplazo. Mandarlo tambien en
      // `items` abriria la puerta a que los dos lados discrepen, que es
      // exactamente lo que D6b vuelve imposible.
      items: isSwap ? [] : editedItems,
      // En una visita MIXTA las dos listas viajan juntas y separadas: `items`
      // es lo vendido, `swappedItems` es el cambio. El servidor reconstruye de
      // ahi la linea de reemplazo con precio cero y la fallada que volvio, asi
      // que el 1 a 1 se sostiene y el reemplazo no se cobra. Sin esta division
      // una mixta directamente no se podia editar.
      ...(hasSwapSide ? { swappedItems: editedSwappedItems } : {}),
      // El `kind` viaja como pista de validacion: el servidor lo compara
      // contra el de la fila guardada y rechaza una edicion que le cambie la
      // clase, nunca le cree de entrada.
      ...(isSwap ? { kind: 'swap' as const } : {}),
      reason: editReason,
      // Omitido (no la key) si la venta nunca estuvo enganchada a un cliente
      // del padron. Mandarlo cuando existe es lo que evita que la edicion le
      // borre el vinculo: la API reescribe `customerId` con lo que reciba.
      ...(sale.customerId ? { customerId: sale.customerId } : {}),
      // Los tres campos de abajo van por el mismo motivo, no por simetria.
      // `updateSale` resuelve `paymentProofRef` como `input.paymentProofRef
      // ?.trim() || null`, `containerReturned` como `input.containerReturned
      // ?? null` y `note` como `input.note?.trim() || null`: lo que la
      // edicion no manda, la API lo borra. Sin esto, corregir una cantidad
      // borraba el comprobante de la transferencia y la respuesta del envase.
      ...(proofRef ? { paymentProofRef: proofRef } : {}),
      // `false` es una respuesta ("no lo devolvio"), no una ausencia: solo se
      // omite cuando nunca se pregunto.
      ...(sale.containerReturned !== undefined
        ? { containerReturned: sale.containerReturned }
        : {}),
      ...(sale.note ? { note: sale.note } : {}),
    };

    // Los envases vacios de la visita NO viajan en el payload, y esa ausencia
    // es deliberada: la API deja quietas las filas de retorno que el payload
    // no nombra, asi que editar un cambio no puede borrarlos sin querer.

    // El catalogo va como segundo argumento por el mismo motivo que en la
    // carga de una venta: pasar una venta ya grabada a un medio que genera
    // deuda vale lo mismo que cargarla asi, y la regla del deudor no se puede
    // contestar sin la tabla de medios de pago.
    const validationErrors = validateUpdateSaleInput(payload, paymentMethods);
    if (validationErrors.length > 0) {
      // Esta pantalla no puede elegir cliente -- la venta ya esta grabada --
      // asi que el mensaje nombra el problema y no una accion que no existe.
      showMessage(
        driverErrorMessage(
          validationErrors[0],
          paymentMethodLabel(paymentMethods, paymentMethod, 'Este medio de pago'),
          'esta venta no tiene un cliente del padrón.',
        ),
        'error',
      );
      return;
    }

    try {
      setSaving(true);
      await api.patch<SaleRecord>(`/sales/${sale.id}`, payload);
      showMessage('Venta editada correctamente.', 'success');
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo editar la venta.';
      showMessage(cause, 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Inicio marca como problema toda venta de hoy cobrada sin efectivo que no
   * tenga comprobante, y manda al chofer justo a esta pantalla. Sin esta
   * accion ese camino terminaria en un cartel que solo enuncia el problema.
   *
   * Reusa el mismo mecanismo de subida que la carga de la venta
   * (`/uploads/receipt` + `File.upload`), y despues guarda con un motivo fijo:
   * el PATCH exige uno, y no tiene sentido hacerle escribir "adjunto lo que
   * faltaba" al chofer.
   */
  const attachMissingProof = async () => {
    setMessage(null);

    try {
      setAttachingProof(true);

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de camara requerido para sacar el comprobante.', 'error');
        return;
      }

      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (shot.canceled || shot.assets.length === 0) {
        return;
      }

      const token = requireAuthToken();
      const uploaded = await new File(shot.assets[0].uri).upload(
        `${API_URL}/uploads/receipt`,
        {
          uploadType: UploadType.MULTIPART,
          fieldName: 'file',
          mimeType: 'image/jpeg',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (uploaded.status < 200 || uploaded.status >= 300) {
        throw new ApiError(uploaded.status, uploaded.body || `API ${uploaded.status}`);
      }

      const { url } = JSON.parse(uploaded.body) as { url: string };

      if (!paymentMethod) {
        showMessage('Elegi un medio de pago antes de adjuntar el comprobante.', 'error');
        return;
      }

      await api.patch<SaleRecord>(`/sales/${sale.id}`, {
        driverName: username,
        truckCode: sale.truckCode,
        customerName: sale.customerName,
        customerType: sale.customerType,
        paymentMethod,
        items: editedItems,
        // El cambio viaja tambien aca, y no por simetria: `updateSale`
        // reescribe TODOS los `SaleItem` de la fila con lo que reciba. Sin
        // esta lista, adjuntar un comprobante a una visita mixta borraria la
        // linea del reemplazo y dejaria la fallada sola, rompiendo el 1 a 1 y
        // devolviendole al camion una unidad que ya no esta.
        ...(hasSwapSide ? { swappedItems: editedSwappedItems } : {}),
        reason: 'Se adjunta el comprobante',
        paymentProofRef: url,
        ...(sale.customerId ? { customerId: sale.customerId } : {}),
        ...(sale.containerReturned !== undefined
          ? { containerReturned: sale.containerReturned }
          : {}),
        ...(sale.note ? { note: sale.note } : {}),
      } satisfies UpdateSaleInput);

      setProofRef(url);
      showMessage('Comprobante adjuntado correctamente.', 'success');
      await refreshDaySummary();
    } catch {
      showMessage('No se pudo subir el comprobante.', 'error');
    } finally {
      setAttachingProof(false);
    }
  };

  const cancelSale = async () => {
    setMessage(null);

    if (!cancelReason || cancelReason.trim().length < 3) {
      showMessage('El motivo de anulacion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    try {
      setCanceling(true);
      await api.patch<SaleRecord>(`/sales/${sale.id}/cancel`, { reason: cancelReason });
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

  return (
    <ScreenContainer testID="sale-detail-screen" scroll>
      <Card style={styles.card}>
        <Text style={styles.customer}>{sale.customerName}</Text>
        <Text style={styles.meta}>
          {CUSTOMER_TYPE_LABELS[sale.customerType] ?? sale.customerType}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatDateTime(sale.occurredAt)}</Text>
          {sale.truckCode ? <Text style={styles.meta}>{sale.truckCode}</Text> : null}
        </View>
        <Text style={styles.total} testID="sale-detail-total">
          {formatArs(total)}
        </Text>

        {isChurn && (
          <Text style={styles.churn} testID="sale-detail-churn">
            Visita sin venta — el cliente devolvio el envase y no compro nada.
          </Text>
        )}

        {isSwap && (
          <Text style={styles.churn} testID="sale-detail-swap">
            Cambio por falla — salio un reemplazo del camion y volvio la unidad
            fallada. No se cobro nada.
          </Text>
        )}

        {isCanceled && (
          <View testID="sale-detail-canceled">
            <Text style={styles.canceledTag}>ANULADA</Text>
            {sale.cancelReason ? <Text style={styles.meta}>{sale.cancelReason}</Text> : null}
          </View>
        )}
      </Card>

      {/*
        En una venta esta lista es lo VENDIDO y nada mas: el reemplazo de un
        cambio sale del camion sin cargo y se edita del lado de la fallada, no
        aca. En una fila de cambio la lista ES el reemplazo, y por eso las dos
        entran por el mismo lugar.
      */}
      {(isSwap ? replacementItems : soldItems).length > 0 && (
        <Card style={styles.card}>
          <SectionLabel variant="field">Productos</SectionLabel>
          {(isSwap ? replacementItems : soldItems).map((item) => (
            <ProductRow
              key={item.productCode}
              code={item.productCode}
              name={item.productCode}
              unitPrice={item.unitPrice}
              // En un cambio esta lista es el lado que SALIO del camion, y su
              // numero es el mismo que el de la fallada que volvio: las dos
              // leen y escriben el mismo estado.
              quantity={
                isSwap
                  ? (swapQuantities[item.productCode] ?? 0)
                  : (quantities[item.productCode] ?? 0)
              }
              onIncrement={() =>
                isEditable &&
                (isSwap
                  ? changeSwapQty(item.productCode, 1)
                  : changeQty(item.productCode, 1))
              }
              onDecrement={() =>
                isEditable &&
                (isSwap
                  ? changeSwapQty(item.productCode, -1)
                  : changeQty(item.productCode, -1))
              }
            />
          ))}
        </Card>
      )}

      {/*
        Tambien en una visita mixta, que es donde mas hace falta: ahi el cambio
        convive con lo vendido y este es el unico lugar donde se lo puede
        mover. Su numero dice las dos cosas a la vez -- la fallada que entro y
        el reemplazo que salio -- asi que no hay dos campos que discrepen.
      */}
      {faultyItems.length > 0 && (
        <Card style={styles.card}>
          <SectionLabel variant="field">Unidades falladas que volvieron</SectionLabel>
          {faultyItems.map((item) => (
            <ProductRow
              key={`faulty-${item.productCode}`}
              code={item.productCode}
              name={item.productCode}
              quantity={swapQuantities[item.productCode] ?? 0}
              testIDPrefix="faulty-row"
              onIncrement={() => isEditable && changeSwapQty(item.productCode, 1)}
              onDecrement={() => isEditable && changeSwapQty(item.productCode, -1)}
            />
          ))}
          <Text style={styles.meta}>
            Es el mismo numero que el reemplazo: mover uno mueve los dos.
          </Text>
        </Card>
      )}

      {emptyItems.length > 0 && (
        <Card style={styles.card} testID="sale-detail-empties">
          <SectionLabel variant="field">Envases vacios que volvieron</SectionLabel>
          {emptyItems.map((item) => (
            <Text key={`empty-${item.productCode}`} style={styles.meta}>
              {item.productCode} · {item.quantity}
            </Text>
          ))}
        </Card>
      )}

      {isEditable && saleProofPolicy !== 'none' && !proofRef && (
        <Card style={styles.card}>
          <SectionLabel variant="field">Falta el comprobante</SectionLabel>
          <Text style={styles.meta}>
            {saleMethodLabel} lleva comprobante y esta venta no tiene ninguno
            adjunto.
          </Text>
          <Button
            label={attachingProof ? 'Subiendo...' : 'Sacar foto del comprobante'}
            onPress={() => void attachMissingProof()}
            disabled={attachingProof}
            testID="sale-detail-attach-proof"
          />
        </Card>
      )}

      {isEditable && (
        <Card style={styles.card}>
          {/*
            Un cambio no cobro nada: el selector no se muestra en absoluto. Una
            fila de pastillas aca solo podria inventar un medio de pago para
            una fila que nunca tuvo uno.
          */}
          {!isSwap && (
            <>
              <SectionLabel variant="field">Cobro</SectionLabel>
              <SegmentedPills
                options={paymentOptions}
                // '' si la venta no tiene medio (churn) o el catalogo no llego:
                // ninguna pastilla marcada, que es la verdad.
                value={paymentMethod ?? ''}
                onChange={setPaymentMethod}
                // Misma grilla que la pantalla de venta nueva: el chofer ve el
                // mismo cobro en los dos lados.
                maxPerRow={3}
                testID="sale-detail-payment"
              />
            </>
          )}

          <SectionLabel variant="field">Motivo de la edicion</SectionLabel>
          <TextField
            ref={editReasonField.ref}
            onFocus={editReasonField.onFocus}
            value={editReason}
            onChangeText={setEditReason}
            placeholder="Por que cambia esta venta"
            testID="sale-detail-edit-reason"
          />
          <Button
            label={saving ? 'Guardando...' : 'Guardar cambios'}
            onPress={() => void saveEdit()}
            disabled={saving}
            testID="sale-detail-save-button"
          />
        </Card>
      )}

      {!isCanceled && (
        <Card style={styles.card}>
          <SectionLabel variant="field">Anular esta venta</SectionLabel>
          <TextField
            ref={cancelReasonField.ref}
            onFocus={cancelReasonField.onFocus}
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder="Motivo de anulacion"
            testID="sale-detail-cancel-reason"
          />
          <Button
            label={canceling ? 'Anulando...' : 'Anular venta'}
            variant="secondary"
            onPress={() => void cancelSale()}
            disabled={canceling}
            testID="sale-detail-cancel-button"
          />
        </Card>
      )}

      <FeedbackBanner message={message} tone={messageTone} />

      <Button
        label="Volver al historial"
        variant="secondary"
        onPress={() => navigation.goBack()}
        testID="sale-detail-back-button"
      />
    </ScreenContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  customer: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  total: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  churn: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  canceledTag: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.error,
    letterSpacing: 0.7,
  },
});
