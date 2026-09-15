# Change: Container Swap — Delivery With No Money

Status: **planned — not implemented**.

## No, this does not exist yet

The model has a `churn` row that looks close and is not the same thing:

| | Entregamos | Recibimos envase | Cobramos |
|---|---|---|---|
| `sale` | sí | opcional (`containerReturned`) | sí |
| `churn` (hoy) | **no** | sí | no |
| `swap` (esto) | **sí** | sí | **no** |

`churn` es "pasé, me devolvieron el envase, no compró" — el chofer llega con
el camión igual de lleno que salió (`recordEmptyVisit` fuerza `items: []`,
`total: 0`, `sales.service.ts:262`). Un cambio de envase descarga mercadería
del camión sin que entre plata, y hoy la única forma de registrarlo es como
una venta normal: obliga a elegir medio de pago y le suma plata al día del
chofer, que es exactamente lo que no queremos.

## Lo que el modelo ya resuelve solo

Dos de los tres requisitos salen gratis, y conviene saberlo antes de diseñar
de más:

**El descuento del camión ya funcionaría.** `getTruckStockForDay` suma los
`SaleItem` de toda venta activa **sin filtrar por `kind`**
(`load-manifests.service.ts:146`). Una fila de swap que lleve sus `items`
descuenta del camión sin tocar una línea de esa consulta. Lo mismo del lado
del teléfono: `queuedUnitsByProduct` saltea sólo `kind === 'churn'`
(`truckStock.ts:23`), así que un swap encolado también descuenta — hay que
revisar ese guard igual, porque está escrito como "churn" y no como "lo que
no descarga".

**La plata del chofer tampoco se toca.** `SyncContext` suma `sale.total`
(`:109`) y el dashboard hace lo mismo en `summarize` (`kpis.ts`). Con
`total: 0` el swap no suma un peso a ninguno de los dos.

Lo que **no** sale gratis es todo lo demás: el medio de pago obligatorio, el
precio, y que un swap no se cuente como una venta más.

## Business Decisions To Confirm

1. **Un swap es 1:1 y sin plata**: se entregan N envases llenos y se reciben N
   vacíos, no hay cobro de ninguna clase.
2. **El medio de pago queda bloqueado**, no en un valor "ninguno": no hay pago
   que elegir.
3. **Descuenta del camión** exactamente como una venta.
4. **No suma plata** al día del chofer ni a la facturación.

**Dos preguntas abiertas para vos** — las dos cambian el diseño:

**A. ¿El swap se cuenta como "venta" en los números?** Hoy `activeCount` /
`ventasActivas` cuentan filas, no plata, así que un swap se contaría como una
venta de $0 y bajaría el ticket promedio de cualquier lectura futura. Mi
recomendación: contarlo aparte, como visita atendida y no como venta. Es la
misma decisión que ya se tomó con `churn`.

**B. ¿Hay que verificar que sea 1:1?** El modelo no guarda *cuántos* envases
vacíos entraron: `containerReturned` es un booleano. Con eso no se puede
comprobar que entraron tantos como salieron. Las opciones son dejarlo así
(confiar en el chofer, cero trabajo) o agregar un contador de envases
recibidos, que es un cambio de modelo aparte. Mi voto: dejarlo booleano
ahora y anotarlo, salvo que te esté pasando que no cierren.

## Design Decisions

**D1 — `swap` es un tercer `SaleKind`, no una bandera sobre una venta.**
`SALE_KINDS` pasa a `['sale', 'churn', 'swap']`.

Es el precedente que ya fijó el propio código: cuando una visita no mueve
plata, es su propia clase de fila y no una venta en cero. El comentario está
escrito en `NewSaleScreen.tsx:567` — *"Envase marcado y nada vendido es
exactamente una visita sin venta. Fila churn, no una venta en cero."* Un swap
es el mismo argumento con mercadería adentro.

Una bandera sobre `sale` obligaría a dejar `paymentMethod` opcional para todas
las ventas — justo la garantía que hace que hoy una venta no pueda grabarse
sin cobro.

**D2 — `SaleKind` sigue siendo un enum de Prisma, no una tabla.** A
diferencia de los medios de pago, sus valores los entiende el código: un
cuarto `kind` es una funcionalidad nueva que hay que programar, no
configuración del dueño. Mismo criterio que `ProofPolicy` en
`payment-methods-table.md`.

**D3 — `recordSwap` es su propio método de servicio.** Igual que
`recordEmptyVisit` (decisión #1 del `visit-container-model`): fuerza
server-side `kind: 'swap'`, `paymentMethod: null`, `total: 0`,
`containerReturned: true`, sin importar lo que traiga el payload. `RecordSwapInput`
directamente **no tiene** el campo `paymentMethod`, así que no hay nada que
colar: es el bloqueo real, y la pantalla que lo deshabilita es sólo la parte
visible.

**D4 — Un swap NO pasa por la tarifación.** `createSale` valoriza con
`priceItemsOrReject`, que rechaza la operación cuando al tipo de cliente le
falta un precio (`sales.service.ts:131`). Un swap no se cobra, así que un
precio faltante no puede bloquearlo — el chofer ya hizo el cambio en la calle.
Sigue la misma lógica que el pie de la pantalla ya aplica al churn: *"una
devolución no tiene nada que cotizar, así que la falta de precios no puede
bloquearla"* (`NewSaleScreen.tsx:579`).

**D5 — `SaleItem.unitPrice` va en 0, y eso es la verdad, no un agujero.**
La columna es `Int` no-nulo (`schema.prisma`). Acá el cero no es el `?? 0` que
el roadmap persiguió como bug: ahí el cero mentía sobre una venta que sí se
cobraba, y acá es el importe real de una línea que efectivamente no cobró
nada. La diferencia la sostiene el `kind`, no el número: cualquier lector que
quiera valorizar mercadería movida tiene que filtrar por `kind`, y este plan
deja los dos sitios que lo hacen ya resueltos.

**D6 — El botón es un modo, no un botón más.** El pie de `NewSaleScreen` ya es
una máquina de estados sobre `containerReturned` + cantidad de items
(`:555-595`). El swap entra como un toggle **"Cambio de envase (sin cobro)"**
que, prendido:
- deshabilita el selector de cobro y la sección de comprobante,
- fuerza `containerReturned = true` (no hay swap sin envase que entre),
- cambia la acción del pie a **"Registrar cambio"**,
- deja de mostrar el total (no hay importe que mostrar; mostrar `$0` invita a
  pensar que se regaló mercadería).

## Phases

### Phase 1 — Shared + API

**Migración `2026xxxxxxxxxx_sale_kind_swap`:**
```sql
ALTER TYPE "SaleKind" ADD VALUE 'swap';
```
Una línea, sin backfill: ninguna fila existente es un swap. **Ojo con el
orden**: Postgres no deja *usar* un valor de enum recién agregado en la misma
transacción que lo agrega. Como esta migración sólo agrega el valor y no
inserta filas que lo usen, pasa; pero no se le puede sumar un `INSERT` con
`'swap'` adentro.

**`packages/shared`:**
- `SALE_KINDS` suma `'swap'`.
- `RecordSwapInput`: como `RecordEmptyVisitInput` **más `items`**, y sin
  `paymentMethod` (D3).
- `validateRecordSwapInput`: exige al menos un item y cantidades enteras > 0;
  no valida precio ni medio de pago.

**`apps/api`:**
- `recordSwap` en `SalesService`, modelado sobre `recordEmptyVisit`: verifica
  existencia de productos (`assertProductCodesExist`), **no** llama a
  `getPriceTableAt` ni a `priceItemsOrReject`, y graba los items con
  `unitPrice: 0`.
- `POST /sales/swap`, junto al endpoint de visita sin venta.
- `updateSale`: el guard de consistencia de `kind` (`:325-335`) ya rechaza
  cambiar la clase de una fila; hay que extender la rama `isChurn` para que
  un swap tampoco reciba `paymentMethod` ni sea tarifado. **Un swap sí puede
  editar cantidades** — es su diferencia con el churn, que no tiene items.

### Phase 2 — Driver app

- `offlineQueue`: `enqueueSwap`, con `kind: 'swap'`. El tipo ya es
  `kind?: SaleKind` y los consumidores tratan la ausencia como `'sale'`
  (`offlineQueue.ts:10-18`), así que las entradas viejas siguen funcionando.
- `truckStock.queuedUnitsByProduct`: el guard `entry.kind === 'churn'` pasa a
  ser "no descarga si no tiene items" — un swap encolado **sí** tiene que
  descontar. Escribirlo sobre los items y no sobre el `kind` evita tener que
  volver acá con el próximo `kind`.
- `NewSaleScreen`: el toggle y el modo de D6.
- `dayProblems`: un swap no puede reclamar comprobante nunca — cae bajo la
  misma regla que ya existe, porque `paymentMethod` es `null` y
  `proofPolicyOf` devuelve `'none'` para eso. No hay nada que tocar, pero sí
  un test que lo fije.
- `SaleDetailScreen`: mostrar un swap como tal, sin selector de cobro, con
  cantidades editables.

### Phase 3 — Dashboard

- Que un swap se lea como swap en la tabla de ventas y en el CSV, no como una
  venta de $0 sin explicación.
- Filtro por tipo de fila (venta / visita / cambio).
- Los KPIs, según la respuesta a la pregunta A.

## Risks

| Riesgo | Mitigación |
|---|---|
| Un swap entra como venta en cero y regala mercadería | `RecordSwapInput` no tiene `paymentMethod` y el servicio fuerza `kind`/`total` server-side (D3). El pie de la pantalla no ofrece "Guardar venta" en modo swap. |
| El chofer usa el swap para tapar una venta que sí cobró | El riesgo real de esta función, y es humano, no técnico. Queda auditable: `SaleAudit` graba la creación, y el dashboard tiene que poder listar los swaps por chofer y por día (fase 3). |
| Se vuelve a agregar un `kind` y hay que revisar todos los `=== 'churn'` | Se corrigen en fase 2 los dos que deciden por `kind` cuando en realidad deciden por "tiene items". |
| Una venta vieja encolada llega sin `kind` | Ya contemplado: se trata como `'sale'` (`offlineQueue.ts:10-18`). |

## Deferred

- **Contar los envases vacíos que entran** (pregunta B). Hoy
  `containerReturned` es booleano y no hay forma de cuadrar N por N.
- **Stock de envases vacíos en el camión.** El swap los hace entrar al camión,
  y hoy el sistema no modela envases vacíos como stock — sólo lo cargado y lo
  vendido. Es un modelo aparte, y es la continuación natural de esto.
