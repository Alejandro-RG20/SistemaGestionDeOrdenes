# Reestructuración: órdenes de reparación e inventario de repuestos

El sistema se acota a dos pilares —**gestión de órdenes de reparación** y
**control del inventario de repuestos**— y deja de gestionar dinero. Este
documento registra las cinco fases del trabajo: auditoría, plan, cambios,
verificación e informe.

Rama: `claude/restructure-repair-orders-system-qthtv0`, construida sobre el
último trabajo empujado (`claude/sistema-web-responsive`, commit `f5995b6`).

---

## Fase 1 · Auditoría

### Arquitectura encontrada

| Pieza | Tecnología | Papel |
| --- | --- | --- |
| `compartido/` | TypeScript | Vocabulario del dominio y contratos de la API, usados por servidor y panel |
| `servidor/` | Node 20 + Express 5 + `pg` + zod | API REST `/api/v1`, un módulo por área, máquina de estados, sincronización idempotente |
| `panel/` | React 18 + Vite | Panel web y aplicación del técnico (PWA sin conexión, IndexedDB) |
| `base-datos/migraciones/` | SQL versionado (0001–0022) | Ejecutor con huella: una migración aplicada no se edita |
| Pruebas | Vitest + supertest contra PostgreSQL real | 493 del servidor y 112 del panel al empezar |

### Qué ya funcionaba y se conserva

- Órdenes: alta con número y código únicos (`OS-AAAA-NNNNNN`), datos congelados al crear (RN-22), máquina de 13 estados con responsable por estado, plazos en horas laborables, notas de corrección para órdenes cerradas.
- Garantías: motor de cobertura versionado y reclasificación con respaldo.
- Agenda y visitas, modalidad ruta/taller, conversión ruta→taller.
- Evidencias por partes con huella SHA-256, matriz de evidencia obligatoria que bloquea el avance.
- Inventario: el movimiento es la fuente de verdad y `existencia` su proyección en la misma transacción; bloqueo de fila; sin existencias negativas; kardex con saldo corrido; recorrido de la solicitud en seis pasos.
- Compras de reposición con separación pedir / recibir.
- Validación técnica (nadie aprueba su propio trabajo, por disparador).
- Seguridad: JWT, bloqueo por intentos, permisos leídos de `rol_permiso` en cada petición, cerco por datos (tienda, técnico).
- Trabajo de campo sin conexión: cola idempotente, espejo de jornada, excepciones de sincronización.

### Módulos financieros encontrados

| Pieza | Qué hacía |
| --- | --- |
| `servidor/src/modulos/cobros/` (6 archivos) y `servidor/src/dominio/cobros/` (4) | Expedientes de cobro a proveedores/pólizas, pagos de clientes, confirmación de pagos, indicadores de recuperación |
| Rutas `/expedientes`, `/ordenes/:id/expediente`, `/pagos`, `/ordenes/:id/pagos`, `/pagos/:id/estado`, `/cobros/indicadores` | API de lo anterior |
| `panel/src/pantallas/Cobros.tsx`, `Pagos.tsx` | Pantallas W-09 y W-24 |
| Sección «Recuperación de garantías» en `Indicadores.tsx` | Montos reclamados, cobrados, tasa de recuperación |
| `compartido/src/dominio/cobro.ts`, `api/cobros.ts`, tipos de pago en `proceso-final.ts` | Contratos |
| Permisos `cobros.*` (5) y roles `gestor_cobros`, `jefe_cobros` | Seguridad |
| Avisos `expediente_bloqueado`, `expediente_sin_respuesta`, `orden_cobrable_sin_expediente` | Bandeja |
| Cifra «Cobros pendientes» del tablero; reportes «Expedientes de cobro», «Pagos de clientes», «Monto facturado» | Indicadores financieros |
| Tablas `pago`, `expediente_cobro`, enumerados `estado_expediente`, `estado_pago` | Datos |

### Dependencias que había que desacoplar

1. **La entrega exigía «pago confirmado»** (`entregas/servicio.ts` sumaba `pago` confirmado contra el total). Una orden particular no podía cerrarse sin registrar dinero.
2. `compartido/src/dominio/cobro.ts` también contenía `ACCION_BITACORA` y `ESTADO_EXCEPCION`, que usa todo el sistema.
3. La semilla `paso-cobros.ts` también sembraba las notas de corrección y la bitácora.
4. Textos de la interfaz que justificaban controles operativos «para el expediente de cobro».

### Funcionalidades incompletas o defectuosas encontradas

| Hallazgo | Consecuencia |
| --- | --- |
| Ninguna pantalla usaba `POST /ordenes/:id/solicitudes-repuesto` | El técnico no podía pedir un repuesto desde la web |
| Al técnico de planta se le «entregaba» la pieza sin movimiento | No había cómo devolver lo no usado ni saber quién tenía la pieza |
| No existía reserva: aprobar una solicitud no apartaba nada | Dos órdenes podían recibir la misma pieza; no había «disponible» |
| El técnico de planta tenía `inventario.solicitud.gestionar` | Podía aprobarse su propia solicitud |
| El técnico podía descontar la bodega central directamente | Saltaba la solicitud y la autorización de bodega |
| La asignación de técnico no quedaba en la bitácora | No se podía saber quién tuvo la orden ni por qué cambió |
| Cada paso de una solicitud sobrescribía al anterior | Una revisión rechazada y vuelta a revisar perdía la primera |
| `POST /ordenes/:id/estado` permitía pasar a «entregada» sin acta | Se saltaba la revisión técnica y la autorización del cliente |
| Una orden particular podía ir de diagnóstico a reparación sin autorización | Reparaciones sin consentimiento del cliente |
| Una solicitud anulada dejaba la orden en «esperando repuesto» para siempre | Orden bloqueada sin salida |
| La pestaña «Bitácora» solo mostraba cambios de estado | No había historial de lo que pasó con la orden |
| `evento_orden`, `movimiento_repuesto`, `bitacora` admitían UPDATE/DELETE | La trazabilidad dependía de que nadie tocara la base |
| Enlaces del tablero con `soloVencidas=true` / `soloActivas=true` | La lista de órdenes ignoraba el filtro (solo aceptaba `1`) |
| «Descargar en CSV» era un `<a href>` sin token | El servidor respondía 401: botón inoperante |
| La carga de evidencias no comprobaba el contenido | Cualquier archivo pasaba por fotografía |
| Reportes solo filtraban por fechas | No había filtro por estado, técnico, tienda, repuesto ni bodega |

### Riesgos para los datos

- Hay órdenes, pagos y expedientes históricos: **no se borra ninguna tabla ni fila**.
- Hay usuarios con roles de cobros: no se borran ni se desactivan las cuentas.
- Las migraciones aplicadas no se editan (el ejecutor lo impide por huella): todo cambio va en una migración nueva.

---

## Fase 2 · Plan de cambios

| Archivo / módulo | Clasificación | Qué se hizo |
| --- | --- | --- |
| `servidor/src/modulos/cobros/*`, `servidor/src/dominio/cobros/*` | Eliminar (dependencias verificadas: solo `aplicacion.ts` lo montaba) | Borrados |
| `panel/src/pantallas/Cobros.tsx`, `Pagos.tsx` | Eliminar | Borrados, con sus rutas y entradas de menú |
| `compartido/src/dominio/cobro.ts`, `api/cobros.ts` | Eliminar | Borrados; `ACCION_BITACORA` y `ESTADO_EXCEPCION` pasan a `dominio/auditoria.ts` |
| Tipos de pago en `compartido/.../proceso-final.ts` | Eliminar | Borrados |
| `servidor/src/modulos/entregas/servicio.ts` | Desconectar | Sin requisito de pago; acta y estado en una sola transacción |
| `avisos`, `indicadores/tablero`, `reportes/catalogo` | Simplificar | Sin avisos, cifras ni reportes financieros |
| `semillas/paso-cobros.ts` | Simplificar | Reemplazado por `paso-notas-bitacora.ts` (notas y bitácora, sin dinero) |
| Tablas `pago`, `expediente_cobro` | Conservar como histórico | Solo lectura por disparador |
| Roles `gestor_cobros`, `jefe_cobros` | Desconectar | Inactivos, sin permisos; las cuentas se conservan |
| Cotización y autorización del cliente | Conservar | Es la decisión operativa del cliente, no un cobro |
| Precios de repuesto y de compra | Conservar | Valoración de inventario y pedidos de reposición; no son cuentas por pagar |
| Compras | Conservar | Reposición de existencias y recepción en bodega |
| Máquina de estados | Corregir | Autorización, solicitudes cerradas, piezas conciliadas y acta para cerrar |
| Inventario | Corregir | Reservas, disponibilidad, bodega de banco, técnico solo opera su bodega |
| Ordenes | Corregir | Asignación auditada; historial unificado |
| Panel | Corregir | Menú por área, tablero, repuestos y evidencias en la orden, disponibilidad, filtros |

---

## Fase 3 · Cambios realizados

### Órdenes

- **Historial unificado** `GET /ordenes/:id/historial`: cambios de estado, asignaciones y reasignaciones (con motivo), diagnósticos, evidencias, cada paso de cada solicitud de repuesto, movimientos de inventario de la orden, visitas, autorización del cliente, revisión técnica, entrega y notas de corrección; cronológico y con el responsable de cada evento. Pestaña «Historial» en el detalle de la orden.
- **Asignación auditada**: `PUT /ordenes/:id/tecnico` escribe en la bitácora técnico anterior y nuevo; reasignar exige motivo; el técnico debe estar activo. Tarjeta «Asignar / Reasignar técnico» en el detalle.
- **Máquina de estados**: una reparación particular no empieza sin autorización del cliente; no se finaliza con solicitudes abiertas ni con piezas entregadas para la orden sin consumo o devolución; no se pasa a «entregada» sin acta; una solicitud anulada o rechazada ya no deja la orden esperando.
- **Entrega sin pagos**: requisitos = reparación terminada, revisión técnica aprobada y, si es particular, autorización del cliente.
- Lista de órdenes: filtros por técnico y tienda; acepta los enlaces del tablero.

### Inventario y solicitudes

Las cinco operaciones quedan diferenciadas:

| Operación | Qué la registra | Efecto |
| --- | --- | --- |
| Solicitar | El técnico (`inventario.solicitud.crear`, nuevo) | Solicitud «solicitada»; cuenta como **comprometido** |
| Reservar | Bodega aprueba (`inventario.solicitud.gestionar`) | Solo si hay **disponible**; pasa a **reservado**. Bloqueo por repuesto para que dos aprobaciones simultáneas no reserven la misma pieza |
| Entregar | Bodega (`inventario.despacho.registrar`) | Movimiento a la **bodega personal del técnico** (de ruta o de banco) |
| Consumir | El técnico, desde **su** bodega | Movimiento de consumo atado a la orden |
| Devolver | El técnico | Movimiento de devolución a la central, atado a la orden |

- Vista `v_disponibilidad_repuesto` y `GET /disponibilidad`: en bodega, con técnicos, reservado, comprometido, disponible. Pantalla «Disponibilidad».
- Cada técnico de planta recibe su **bodega de banco** (la migración la crea; a los técnicos nuevos se les abre al entregarles la primera pieza).
- Un técnico solo mueve existencias desde su propia bodega.
- Cada paso de una solicitud queda en la bitácora (antes se sobrescribía).
- Pestaña «Repuestos» del detalle de la orden: solicitar (búsqueda en catálogo con disponibilidad), recorrido con los pasos que el usuario puede dar, lo que el técnico tiene en su bodega con «Registrar uso» y «Devolver sin usar», y los movimientos de la orden.

### Evidencias

- Pestaña «Evidencia»: carga real por partes desde el panel (recepción, diagnóstico, repuestos, reparación, pruebas, entrega), con huella SHA-256; solo se da por guardada cuando el servidor lo confirma.
- El servidor comprueba la **firma de bytes** del archivo: solo JPEG, PNG, WEBP, HEIC y PDF (`ARCHIVO_NO_ADMITIDO` en otro caso). Tamaño máximo 15 MB en el panel, 50 MB en la API.
- Una evidencia no se puede borrar (disparador).

### Panel operativo

Cifras con datos reales, en tres grupos: **órdenes** (registradas 30 d, pendientes de asignación, en diagnóstico, en reparación, esperando repuesto, esperando autorización, finalizadas por entregar, cerradas 30 d, retrasadas, tiempo promedio de reparación), **inventario** (unidades disponibles, bajo mínimo, solicitudes pendientes, reservadas, entregadas y consumidas 30 d, diferencias de inventario 30 d, reposiciones pendientes) y **campo**; carga por técnico, repuestos con mayor consumo y movimientos recientes. Todo respeta el cerco de cada usuario.

### Reportes

Sin reportes financieros. Nuevos: «Órdenes retrasadas y por qué», «Solicitudes de repuesto», «Disponibilidad de repuestos». Filtros por estado, técnico, tienda, repuesto y bodega, declarados por cada reporte según lo que su consulta aplica. La descarga CSV ahora envía la sesión.

### Navegación

Menú agrupado en **Órdenes de reparación** (órdenes, nueva orden, asignación de técnicos, agenda, validación técnica, entregas pendientes, clientes), **Inventario de repuestos** (solicitudes, disponibilidad, catálogo y bodegas, movimientos, kardex, reposición) y **Control y administración** (reportes, indicadores, reglas de garantía, excepciones, tiendas, usuarios y permisos). Sin entradas de cobros ni pagos. El técnico conserva su menú propio.

### Roles

| Rol del pedido | Rol en el sistema | Cambio |
| --- | --- | --- |
| Administrador | `administrador` (y la jefatura de atención, que administra) | Sin permisos de cobros |
| Agente de atención o recepción | `agente_telefonia`, `jefe_atencion_cliente`, `usuario_tienda` | La jefatura de atención puede adjuntar evidencia; el agente telefónico sigue sin entregar artículos (no los tiene en la mano) |
| Gestor o coordinador de técnicos | `gestor_tecnicos`, `jefe_tecnicos` | Sin cambios |
| Técnico | `tecnico_ruta`, `tecnico_planta` | Solicitan con `inventario.solicitud.crear`; ya no aprueban; solo mueven su bodega |
| Responsable de bodega | `bodeguero` (y `jefe_compras`) | Sin cambios; la aprobación ahora reserva y valida disponibilidad |
| — | `gestor_cobros`, `jefe_cobros` | Inactivos, sin permisos |

---

## Cambios de base de datos

Una sola migración nueva, **`0023_desacople_financiero_y_reservas.sql`**. No
se editó ninguna migración aplicada y no se borra ninguna tabla ni fila de
negocio.

1. Borra las filas de `permiso` y `rol_permiso` con código `cobros.%` (son catálogo de permisos, no datos de negocio) y marca inactivos los roles `gestor_cobros` y `jefe_cobros`.
2. Crea el permiso `inventario.solicitud.crear`, se lo da a los técnicos y le quita `inventario.solicitud.gestionar` al técnico de planta. Da `campo.evidencia.cargar` a la jefatura de atención.
3. `pago` y `expediente_cobro` quedan de **solo lectura** por disparador: el histórico se consulta pero no cambia.
4. `evento_orden`, `movimiento_repuesto`, `bitacora`, `nota_correccion`, `entrega` y `validacion_tecnica` quedan **de solo agregar**; `evidencia` no admite DELETE.
5. Crea la bodega de banco de cada técnico de planta y la vista `v_disponibilidad_repuesto`.

**Impacto sobre datos existentes:** ninguna fila de negocio se modifica.
Las cuentas con rol de cobros siguen existiendo; al aplicar la migración no
pueden operar nada hasta que la administración les asigne un rol operativo.

**Respaldo y reversión:** antes de aplicar en producción,
`pg_dump -Fc servitotal > respaldo_antes_0023.dump`. La reversión manual
está en `base-datos/reversiones/0023_revertir.sql` (fuera de la carpeta de
migraciones a propósito, para que el ejecutor no la aplique).

---

## Fase 4 · Verificación

### Comandos ejecutados

| Comando | Resultado |
| --- | --- |
| `npm ci` | instalación limpia |
| `npm run verificar-tipos` | sin errores (compartido, servidor, pruebas del servidor, panel) |
| `npm run prueba` (servidor) | **36 archivos, 485 pruebas, todas en verde** |
| `npm run prueba:panel` | **11 archivos, 114 pruebas, todas en verde** |
| `vite build` del panel | construye sin errores |
| `npm run migrar` + `npm run sembrar` sobre base vacía | 23 migraciones; siembra completa |

La primera corrida tuvo 12 fallos. Todos se analizaron: siete eran pruebas
que suponían el comportamiento anterior (el técnico descontando la bodega
central, la entrega por `/estado`, 43 usuarios y 13 roles, los expedientes
sembrados) y se actualizaron a la regla nueva; los otros cinco señalaron
**un defecto real**, preexistente, que se corrigió: la máquina de estados solo
dejaba mover una orden «finalizada» al agente telefónico, que no tiene el
permiso de entregar, así que **ninguna orden podía entregarse por el acta de
entrega**. Ahora la entrega la registra quien tiene `ordenes.entregar`, y
sigue exigiendo el acta, la revisión técnica y la autorización del cliente.

### El ciclo completo, probado por la API

`servidor/pruebas/integracion/ciclo-completo.prueba.ts` recorre de punta a
punta una orden, con una sesión distinta para cada rol:

1. El agente registra la orden (código `OS-AAAA-NNNNNN`).
2. La recepción adjunta una fotografía real por partes, verificada por huella.
3. El gestor asigna técnico; reasignar sin motivo responde 400; con motivo, queda en la bitácora.
4. La orden avanza a diagnóstico con su evidencia obligatoria.
5. El técnico solicita el repuesto; **no puede aprobarse su propia solicitud** (403).
6. Bodega aprueba: lo **reservado** sube y lo **disponible** baja exactamente en la cantidad.
7. Una solicitud sin disponibilidad no se aprueba (`SIN_DISPONIBILIDAD`) y queda en revisión.
8. Bodega prepara y entrega: la pieza sale de la central y entra a la bodega de banco del técnico.
9. El técnico **no puede** descontar la bodega central (403).
10. El técnico registra el consumo desde su bodega; **no puede finalizar** con una pieza sin conciliar.
11. Devuelve la pieza no usada y entonces sí finaliza.
12. El kardex de la bodega del técnico muestra despacho, consumo y devolución, con saldo coherente.
13. Revisión técnica y entrega **sin ningún pago**: la verificación no tiene requisito de pago y la tabla `pago` no recibe filas.
14. El historial contiene estados, asignación y reasignación, evidencia, diagnóstico, solicitudes (incluida la anulada), movimientos, revisión y entrega, en orden cronológico y con responsable.
15. `UPDATE`/`DELETE` sobre `evento_orden`, `movimiento_repuesto` y `bitacora` fallan en la propia base.

Y además: las rutas `/expedientes`, `/pagos` y `/cobros/indicadores`
responden 404; no queda ningún permiso `cobros.*` ni rol de cobros activo;
`pago` rechaza inserciones; el tablero no tiene cifras de cobros; quien solo
consulta no mueve inventario ni crea órdenes; el agente no registra
movimientos; bodega no asigna técnicos; un técnico no ve el historial de una
orden ajena; el archivo que no es imagen ni PDF se rechaza.

### La migración sobre datos del esquema anterior

Se sembró una base con el código anterior (`f5995b6`, 22 migraciones) y se le
aplicó la 0023 con el código nuevo:

| | Antes | Después |
| --- | ---: | ---: |
| Órdenes | 30 000 | 30 000 |
| Eventos de orden | 238 535 | 238 535 |
| Movimientos de repuesto | 35 487 | 35 487 |
| Evidencias | 166 979 | 166 979 |
| Pagos (histórico) | 14 824 | 14 824 |
| Expedientes de cobro (histórico) | 8 401 | 8 401 |
| Usuarios | 43 | 43 |
| Unidades en existencia | 22 846 | 22 846 |
| Permisos `cobros.*` | 5 | 0 |
| Bodegas personales de técnicos | 8 | 16 |

Las cinco cuentas con rol de cobros no pueden iniciar sesión mientras su rol
esté inactivo; se comprobó que la administración les asigna un rol operativo
(`PATCH /usuarios/:id`) y vuelven a entrar.

### Prueba de humo del panel

Con la base migrada, en Chromium: tablero, disponibilidad, reportes, lista
de órdenes vencidas (el enlace del tablero ahora filtra) y las pestañas
Resumen, Repuestos, Evidencia e Historial de una orden en reparación. Sin
errores de consola ni respuestas 5xx. Se corrigió un detalle visto ahí: el
menú marcaba «Entregas pendientes» en cualquier pantalla de órdenes.

---

## Fase 5 · Informe

### Módulos financieros retirados

Expedientes de cobro, pagos de clientes (registro, confirmación, anulación),
indicadores de recuperación, avisos de cobros, cifra «Cobros pendientes»,
reportes «Expedientes de cobro», «Pagos de clientes» y «Monto facturado», los
permisos `cobros.*` y los roles de cobros. Sus datos se conservan como
histórico de solo lectura.

### Funcionalidades conservadas

Garantías, cotización y autorización del cliente, validación técnica, entrega
con acta, compras de reposición con recepción en bodega, agenda y visitas,
trabajo de campo sin conexión con su cola idempotente, portal público,
cerco por datos, bitácora, kardex, reportes y exportación CSV.

### Problemas pendientes

- Los datos sembrados anteriores a la 0023 tienen solicitudes antiguas que
  nunca pasaron por el recorrido nuevo (por ejemplo, órdenes en reparación con
  una solicitud todavía «solicitada»). Son datos de prueba; en una base real
  habría que revisarlas una vez con bodega.
- El diagnóstico sigue registrándose desde la aplicación del técnico (cola de
  sincronización). El panel web lo muestra en el historial pero no tiene un
  formulario propio de diagnóstico para quien trabaja en línea.
- El filtro por repuesto de los reportes pide el identificador (se copia del
  kardex); un buscador sería más cómodo.
- La pestaña de evidencias lista los archivos pero no los muestra: el
  servidor guarda la referencia estable y la huella, sin ruta de descarga.

### Comandos para ejecutar el sistema localmente

```bash
npm ci
cp .env.ejemplo .env                 # ajustar DATABASE_PASSWORD y JWT_SECRET
createdb servitotal
npm run migrar                       # 23 migraciones
npm run sembrar                      # datos de prueba (unos 5 minutos)
npm run desarrollo                   # API en http://localhost:3000
npm run panel                        # panel en http://localhost:5173
```

Usuarios y contraseña de prueba en [GUIA_LOCAL.md](../GUIA_LOCAL.md).
Pruebas: `npm run verificar-tipos`, `npm run prueba`, `npm run prueba:panel`.

Para una base existente: respaldo con `pg_dump`, luego `npm run migrar`
(aplica solo la 0023), y asignar un rol operativo a las cuentas que tenían
rol de cobros.
