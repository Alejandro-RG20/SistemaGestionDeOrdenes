# Diagnóstico de ServiTotal frente al pliego definitivo

Documento pedido por el §2 del pliego: *«NO empieces modificando código
inmediatamente. Primero analiza completamente el proyecto actual.»*

Lo que sigue no es una lista de deseos. Cada punto se comprobó contra el
sistema corriendo —base de datos con 30 000 órdenes, 43 usuarios, 13 roles—
y donde digo «vulnerable» hay una petición real que lo demuestra, con su
respuesta pegada.

Fecha de la auditoría: 2026-10-05. Rama `claude/sistema-web-responsive`,
commit `e00ebcf`.

---

## 1. Lo que ya funciona y no hay que tocar

El §3 es explícito: no romper lo que funciona. Esto funciona, está probado
y se queda como está.

| Área | Estado |
| --- | --- |
| Base de datos | 47 tablas, 20 migraciones, invariantes en disparadores PL/pgSQL |
| Autenticación | JWT HS256, scrypt, bloqueo por intentos, refresco |
| Máquina de estados de la orden | Responsable único por estado; **sí** comprueba que quien mueve la orden es el técnico asignado |
| Separación de funciones | pedir ≠ recibir (compras), registrar ≠ confirmar (pagos), nadie valida su propio trabajo (disparador en la base) |
| Inventario, aritmética | Movimiento como fuente de verdad, `existencia` como proyección en la misma transacción, bloqueo de fila, todo-o-nada |
| PWA, offline, IndexedDB | Service worker, almacén IndexedDB, cola de operaciones, espejo de jornada |
| Sincronización | UUID de operación por cada envío, idempotencia verificada contra la clave, excepciones de conflicto en bandeja |
| Portal público | Consulta por código o número, sin datos sensibles |
| Auditoría | Bitácora por operación, con identificador de correlación |
| Pruebas | 445 del servidor en 32 archivos, 101 del panel |

El §44, §45 y §46 del pliego nuevo piden exactamente la capa offline que
habíamos conservado. Queda validada: no hay nada que deshacer ahí.

---

## 2. Vulnerabilidades confirmadas

Son dos, las dos del mismo tipo —una puerta que mira el permiso pero no
mira de quién es el dato— y las dos reproducidas contra el sistema vivo.

### 2.1 Un usuario de solo consulta puede inventar existencias

`POST /movimientos` está protegido con `inventario.consultar`, que es el
permiso de **leer**. El servicio tampoco mira el tipo de movimiento contra
el permiso que le correspondería. Resultado: cualquiera que pueda mirar el
inventario puede ingresar, despachar o ajustar.

Prueba con `arodriguez`, rol `usuario_consulta`, 8 permisos, ninguno de
escritura de inventario:

```
antes:   4 unidades de REF-TER-011 en Bodega central
POST /api/v1/movimientos  {"tipo":"ingreso","cantidad":99,...}
HTTP 200 — movimiento a93053d0 creado
después: 103 unidades
```

Esto viola el §12 (cada rol solo lo suyo), el §14 (un permiso por
operación) y el §65 (separación de funciones). La sonda quedó revertida.

### 2.2 Un técnico ve las 30 000 órdenes y abre la de cualquier compañero

El §13 pide `403 FORBIDDEN` cuando un técnico pide por URL directa una
orden que no es suya. El alcance por datos existe, pero solo para el
usuario de tienda: `obtenerFicha` filtra por `actor.idTienda` y nada más.
Un técnico tiene `ordenes.consultar` y con eso lo ve todo.

Prueba con `robando`, rol `tecnico_ruta`:

```
GET /api/v1/ordenes?tamano=5        → total visible: 30000
GET /api/v1/ordenes/17929fd6-...    → HTTP 200
   orden OS-2025-000024, asignada a OTRO técnico
   cliente: Jazmina Gomez Palacios
   teléfono: 81680176
   dirección: Villa Progreso, casa 50
```

No es solo un listado de más: son el teléfono y la dirección de casa de un
cliente que ese técnico no tiene por qué visitar. `GET
/ordenes/:id/evidencias` tiene la misma puerta y por tanto la misma fuga.

La pantalla de campo (`/campo/jornada`) **sí** está acotada al técnico. La
fuga está en los endpoints generales, que el técnico también alcanza.

---

## 3. Lo que falta o está a medias

### 3.1 Formato de respuesta (§50)

El pliego fija `{success: true, data: {...}}` y
`{success: false, error: {code, message}}`. El sistema responde
`{datos, paginacion}` y `{error: {codigo, mensaje, correlationId}}`.

Es un cambio de contrato que toca todos los controladores, todas las
pruebas de integración y todo el cliente del panel. Hay que hacerlo de una
vez y con las pruebas de respaldo, no endpoint por endpoint.

### 3.2 Nombres de permisos (§14)

El pliego nombra `orden.ver`, `orden.crear`, `inventario.entrada`,
`inventario.salida`, `compra.aprobar`… El sistema usa
`ordenes.consultar`, `inventario.ingreso.registrar`,
`compras.gestionar`… Son 54 permisos con otro esquema de nombres.

El esquema actual distingue cosas que el del pliego junta (ingreso ≠
despacho ≠ ajuste, cada uno su permiso), así que renombrar sin perder
granularidad quiere un mapa explícito, no un buscar-y-reemplazar.

### 3.3 Inventario (§23–§32)

| Lo que pide el pliego | Lo que hay |
| --- | --- |
| Entradas, salidas, transferencias, devoluciones, ajustes | Los cinco tipos existen en el dominio y en la base; **una sola pantalla** los expone y no todos tienen formulario |
| **Kardex por repuesto** con saldo corrido | No existe. Hay listado de movimientos sin saldo acumulado |
| Flujo de solicitud: solicita → revisa → aprueba → prepara → entrega → recibe | La tabla `solicitud_repuesto` tiene un booleano `liberada`. Dos estados, no seis |
| Vista de inventario del técnico («mis repuestos») | No existe como pantalla |
| Alertas de mínimo | Existe y funciona (vista `v_repuesto_bajo_minimo`) |

### 3.4 Estados del expediente de cobro (§39)

Pide Pendiente / Preparando / Enviado / Observado / Aprobado / Rechazado /
Pagado / Cerrado. Hay siete estados y no son los mismos: falta `observado`
y falta `cerrado`, y `bloqueado_por_evidencia` no está en la lista del
pliego (aunque hace un trabajo real que no conviene perder).

### 3.5 Menús por rol (§10, §11)

El menú se arma por permisos, con tres grupos. El pliego pide un árbol
concreto por rol, y en particular un menú de técnico reducido: Inicio, Mis
órdenes, Mi agenda, Mis repuestos, Solicitudes, Evidencias,
Sincronización, Mi perfil. Hoy el técnico ve el menú general filtrado.

### 3.6 Reportes y tablero (§42, §43)

Los 17 reportes existen y consultan datos reales. Falta la **exportación**
(§43) y el tablero del §42 es el de indicadores actual, que no cubre todas
las tarjetas que el pliego enumera.

### 3.7 Notificaciones (§55)

Hay bandeja de avisos (`GET /avisos`), que es lo que pediste: el
responsable entra a ver. El §55 enumera avisos que hoy no se generan.

### 3.8 Pruebas que el pliego nombra (§56–§61)

Faltan, como pruebas con ese nombre: permisos por rol uno a uno, el ciclo
de vida completo de una orden de punta a punta, la aritmética del
inventario del §59 (10 → 7/3 → 2 → 8/1 con kardex), y las de flujo de
garantía, offline y conflicto.

---

## 4. Lo que NO voy a hacer sin que lo autorices

El §4 prohíbe cambiar el esquema por conveniencia. Estos tres cambios
tocan tablas y los dejo planteados, no hechos:

1. **`solicitud_repuesto`**: para los seis estados del §26 hace falta una
   columna de estado (enumerado) y el registro de quién hizo cada paso.
   El booleano `liberada` se puede derivar del estado, así que no se
   pierde nada ni hay que migrar a mano: el dato existente se traduce.
2. **`expediente_cobro.estado`**: añadir `observado` y `cerrado` al
   enumerado. Añadir valores a un enumerado no reescribe filas.
3. **Kardex**: no necesita tabla nueva. Es una consulta con suma corrida
   sobre `movimiento_repuesto`, que ya guarda todo lo necesario.

Ninguno borra ni renombra nada de lo que ya está.

---

## 5. Orden en que lo voy a hacer

Primero lo que deja el sistema inseguro, después lo que deja el sistema
incompleto, al final lo cosmético.

1. Las dos vulnerabilidades del punto 2, con prueba que falle antes y pase
   después.
2. Alcance por datos completo (§12, §13) y permiso por operación (§14).
3. Inventario: kardex, flujo de solicitud, pantallas que faltan.
4. Formato de respuesta del §50.
5. Estados de cobro, menús por rol, exportación de reportes, avisos.
6. Las pruebas del §56–§61 y el informe de 21 puntos del §67.
