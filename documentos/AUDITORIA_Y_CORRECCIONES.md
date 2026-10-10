# Auditoría y corrección integral · ServiTotal

Segunda etapa, sobre la reestructuración descrita en `REESTRUCTURACION.md`.
Las mejoras se hicieron sobre el mismo sistema: misma arquitectura, mismas
rutas y tablas, sin un segundo sembrador, **sin migraciones nuevas** y **sin
cambios de esquema**.

Rama: `claude/restructure-repair-orders-system-qthtv0`.

| Commit | Qué corrige |
|---|---|
| `2d83908` | Clientes: alta con control de duplicados, edición, baja y reactivación; «Nueva orden» con el cliente ya elegido |
| `de05f20` | Usuarios y roles: gestionar usuarios ya no equivale a ser administrador; pantalla de administración completa |
| `08784e4` | Excepciones de sincronización: lectura legible en lugar de JSON crudo |
| `ba19c70` | Cola de sincronización: el mismo cerco y las mismas reglas que el panel |

---

## 1. Diagnóstico (causa raíz de cada problema)

### Clientes
- **La lista no abría la ficha.** `Clientes.tsx` solo enlazaba a «Ver órdenes»; no había forma de llegar a `/clientes/:id` desde la lista, ni botón para registrar.
- **La ficha era de solo lectura.** El backend ya tenía `PATCH /clientes/:id`, `POST …/telefonos` y `POST …/direcciones`, pero ninguna pantalla los usaba.
- **No había baja.** No existía un endpoint para desactivar ni para reactivar (la columna `cliente.activo` sí existía).
- **No se controlaban los duplicados.** `POST /clientes` insertaba sin buscar la misma identificación ni el mismo teléfono.
- **Se podía abrir una orden para un cliente desactivado o fusionado.** `ordenes/servicio.ts` solo comprobaba que el cliente existiera.

### «Nueva orden» desde el cliente
- El efecto de precarga de `NuevaOrden.tsx` se volvía a disparar cada vez que `cliente` quedaba en `null`. Por eso **«Cambiar de cliente» volvía a cargar el mismo cliente** y no había forma de elegir otro.
- Si la precarga fallaba (cliente inexistente, desactivado o sin permiso), el error se tragaba con `.catch(() => undefined)` y la pantalla quedaba en la búsqueda **sin decir por qué**.
- Desde *Órdenes filtradas por cliente*, el botón «Nueva orden» iba a `/ordenes/nueva` y **perdía el `idCliente`**.

### Usuarios, roles y administrador
- **Contradicción de datos y textos.** La pantalla y los comentarios decían «no existe un rol de administrador aparte», pero el catálogo define `administrador`, con todos los permisos, y la siembra crea una cuenta con ese rol.
- **Escalada de privilegios (confirmada).** Quien tenía `seguridad.usuario.gestionar` (la jefatura de atención) podía:
  - asignarse a sí misma el rol `administrador` con `PATCH /usuarios/:id`;
  - crear cuentas de administración;
  - cambiar la contraseña de un administrador y entrar con su cuenta.
  - Con `seguridad.rol.gestionar`, además podía darse cualquier permiso editando su propio rol.
- **«Desbloquear» fallaba siempre.** El panel lo llamaba sin el `motivo` que el servidor exige, y la respuesta era 400.
- **«Revocar dispositivo» fallaba siempre** por la misma razón.
- **No había reactivación de usuarios**, ni pantalla para alta, edición, rol, contraseña o permisos.

### Excepciones que mostraban JSON
- `Excepciones.tsx` mostraba `JSON.stringify(cargaOriginal)` y nada más.
- En la base conviven **tres formas de carga**:
  1. la operación rechazada, tal como llegó del dispositivo;
  2. el consumo aceptado con diferencia (`{operacion, diferencia}`);
  3. los registros resumidos que genera la siembra.
- **El caso «cotizada + visita.registrar» lo origina la siembra.** `paso-sincronizacion.ts` elige al azar el tipo de operación y el motivo, y anota como `estado_local` el **estado final** de la orden, no el estado que tenía cuando se registró la operación. Por eso aparecen combinaciones como estas:
  - un diagnóstico con motivo de «precio del repuesto»;
  - una evidencia sobre una orden «entregada»;
  - un tipo `evidencia.cargar`, que no existe (el real es `evidencia.registrar`).
- Se investigó la regla real: el servidor **no exige un estado de orden para registrar una visita**, solo que haya una visita vigente. Por eso no se marca como imposible.
- La siembra **no se modificó**: el comportamiento de `npm run sembrar` queda igual. La corrección está en cómo se interpretan y presentan los registros.
- La pantalla, además, pedía 5 caracteres de resolución contra los 10 que exige el servidor, e ignoraba `/excepciones/:id`.

### Cola de sincronización (hallazgo de seguridad)
Los ejecutores de `visita.registrar`, `diagnostico.registrar`, `inventario.consumo` y `evidencia.registrar` **no aplicaban el cerco por datos ni miraban si la orden estaba cerrada**. El panel sí lo hacía. Por la cola, un técnico podía:
- operar sobre órdenes de otro técnico o ya entregadas;
- registrar un diagnóstico **a nombre de otro técnico**, porque el `idTecnico` venía de la carga;
- consumir desde la bodega central y, gracias al ajuste automático de faltantes, **crear existencias** en ella;
- **sobrescribir el resultado de una visita ya registrada**, porque la visita sigue «vigente» después de cerrarse.

---

## 2. Correcciones

### Servidor
- **Clientes**
  - `POST /clientes` rechaza con `409 CLIENTE_DUPLICADO` la identificación de otro cliente activo. Si el teléfono ya es el vigente de otro cliente, responde `409 CLIENTE_POSIBLE_DUPLICADO`, salvo que se envíe `confirmarDuplicado: true`. La respuesta incluye el id de la ficha existente.
  - Nuevos `POST /clientes/:id/desactivar` y `POST /clientes/:id/activar`. Exigen motivo, que queda en la bitácora. No borran nada y no admiten fichas fusionadas.
  - Usan el permiso existente `clientes.fusionar` (supervisión de fichas), para no tocar el catálogo sembrado.
- **Órdenes:** crear una orden para un cliente desactivado o fusionado se rechaza con un mensaje claro.
- **Usuarios**
  - Solo el rol `administrador` puede crear cuentas de administración y asignar ese rol.
  - Solo un administrador puede modificar, desactivar, reactivar, desbloquear o cambiar la contraseña de una cuenta de administración.
  - Nadie cambia su propio rol (`NO_PUEDE_CAMBIAR_SU_ROL`).
  - Nuevo `POST /usuarios/:id/activar`.
- **Roles:** fuera del administrador, nadie toca el rol de administrador ni su propio rol, y **nadie concede un permiso que él mismo no tiene**. Retirar permisos sí está permitido.
- **Excepciones:** `dominio/sincronizacion/lectura-excepcion.ts` (código puro) traduce la carga a una lectura que se entrega en `lectura`:
  - la operación, el momento y si se hizo sin conexión;
  - el estado anotado frente al estado actual;
  - los campos enviados;
  - qué exige el servidor para aplicarla;
  - las contradicciones del registro.

  La carga original sigue intacta en `cargaOriginal`.
- **Cola de sincronización**
  - Las cuatro operaciones exigen el cerco y una orden no cerrada.
  - El diagnóstico se registra con el técnico de la sesión.
  - El consumo solo se acepta desde la bodega propia del técnico (`BODEGA_AJENA`).
  - Una visita con resultado no se vuelve a registrar (`VISITA_YA_REGISTRADA`), y solo la cierra el técnico al que se programó.
  - Los rechazos quedan en la bandeja de excepciones: el trabajo de campo no se pierde.

### Panel
- **Clientes**
  - La lista enlaza a la ficha, filtra activos y desactivados, pagina y busca por teléfono exacto.
  - Registro con manejo de duplicados: ofrece abrir la ficha existente o confirmar si es otra persona.
- **Ficha del cliente:** editar datos, agregar o cambiar teléfono (el anterior queda en el historial), agregar dirección, y desactivar o reactivar con motivo y confirmación.
- **Nueva orden**
  - Precarga una sola vez, con estado de carga y error visible.
  - «Cambiar de cliente» funciona.
  - Desde órdenes filtradas por cliente, el cliente se conserva.
- **Administración**, con pestañas según permiso:
  - **Usuarios:** búsqueda, filtros, alta, edición, cambio de rol con confirmación, contraseña, desbloqueo, baja y reactivación.
  - **Roles y permisos:** permisos agrupados por módulo; edición con motivo y confirmación.
  - **Dispositivos:** la revocación ahora pide el motivo.
- **Excepciones**
  - Lista por estado y paginada.
  - Detalle con la lectura, las advertencias y los datos técnicos plegables.
  - Confirmación al resolver y el mínimo real de 10 caracteres.

---

## 3. Seguridad

- Todo lo anterior se comprueba **en el servidor**. Ocultar botones solo evita ofrecer lo que se va a rechazar.
- Una cuenta desactivada o bloqueada deja de valer **en la siguiente petición**: el usuario se relee en cada solicitud y el refresco vuelve a comprobarlo. Hay pruebas que lo verifican.
- Un cambio de rol se aplica en la siguiente petición, sin volver a iniciar sesión. Hay prueba.
- Todas las operaciones administrativas dejan asiento en la bitácora, con valor anterior, valor nuevo y motivo.
- **Credenciales:**
  - `.env` está en `.gitignore` y no hay ninguno versionado.
  - `.env.ejemplo` solo trae valores de ejemplo (`DATABASE_PASSWORD=postgres`, `JWT_SECRET=cambie-esta-clave…`).
  - La contraseña común de la siembra (`ServiTotal.2026`) es un dato de prueba documentado. **No debe usarse fuera de desarrollo.** Si alguna base accesible desde fuera se sembró con ella, esas contraseñas deben cambiarse.
  - No se encontraron credenciales reales en el repositorio.

---

## 4. Lo que NO se cambió

- **Esquema:** no hay migraciones nuevas ni cambios en tablas, columnas, enumerados, relaciones o restricciones.
  - Reactivar usa la acción `modificar` de la bitácora, porque su CHECK (migración 0013) no admite `activar`.
- **`npm run sembrar`:** no se tocó nada de `servidor/src/infraestructura/semillas/`.
  - En `compartido/src/dominio/seguridad.ts` y `matriz-permisos.ts` solo cambiaron **comentarios**; los códigos, roles y la matriz son idénticos.
  - Verificación: `git diff b6c6d29..HEAD -- servidor/src/infraestructura/semillas compartido/src/dominio/matriz-permisos.ts compartido/src/dominio/seguridad.ts` muestra solo líneas de comentario.
- **Cobros:** sigue retirado y su historial sigue en la base, de solo lectura.
- **Pruebas:** no se eliminó ninguna prueba. Tres pruebas existentes se ajustaron porque dependían de los huecos que se cerraron:
  - `administracion.prueba.ts` restituye los permisos como administrador, porque la jefatura no puede conceder `inventario.ajuste.registrar`.
  - En `sincronizacion.prueba.ts`, los consumos encargan la orden al técnico, como ya hacía el caso de la orden anulada.
  - En `evidencias.prueba.ts`, la ficha y el archivo los envía el mismo técnico desde su dispositivo.

---

## 5. Pruebas

**Nuevas pruebas**
- `clientes.prueba.ts`: duplicados por identificación y por teléfono; baja y reactivación; orden rechazada para un cliente desactivado; ficha fusionada.
- `escalada-privilegios.prueba.ts`, nueva:
  - la jefatura no crea administradores, no se cambia el rol, no toca la cuenta del administrador y no se concede permisos;
  - el administrador sí puede;
  - el token deja de valer al desactivar la cuenta;
  - un cambio de rol se aplica de inmediato.
- `sincronizacion.prueba.ts`: orden ajena, bodega ajena, diagnóstico a nombre de otro técnico, visita sobrescrita y evidencia en orden cerrada.
- `unidad/lectura-excepcion.prueba.ts`: las tres formas de carga, las contradicciones y que no se inventan estados.

**Resultados:** ver la sección 7.

---

## 6. Comandos en Windows (PowerShell)

```powershell
# 1. Traer la rama
git fetch origin
git switch claude/restructure-repair-orders-system-qthtv0
git pull

# 2. Dependencias (respeta package-lock.json)
npm ci

# 3. Variables: copie el ejemplo y ajuste la contrasena de PostgreSQL y JWT_SECRET
Copy-Item .env.ejemplo .env
notepad .env

# 4. Compilar y revisar tipos
npm run construir -w compartido
npm run verificar-tipos
npm run construir -w panel

# 5. Migraciones (esta etapa no agrega ninguna; confirme que todo esta aplicado)
npm run migrar:estado
npm run migrar

# 6. Pruebas (usan una base propia servitotal_pruebas*, nunca la de trabajo)
$env:BD_CONTRASENA = "su-contrasena"
$env:JWT_SECRETO   = "una-clave-de-pruebas-de-al-menos-32-caracteres-123456"
npm run prueba
npm run prueba -w panel

# 7. Levantar (dos ventanas de PowerShell)
npm run desarrollo               # API en http://localhost:3000
npm run iniciar -w panel         # Panel en http://localhost:5173
```

### Verificar en PostgreSQL que no se perdió nada

```sql
-- Ninguna migracion pendiente ni editada (la ultima es la 0023)
SELECT nombre, aplicada_en FROM migracion_aplicada ORDER BY nombre DESC LIMIT 3;

-- Historico intacto
SELECT (SELECT count(*) FROM orden_servicio)  AS ordenes,
       (SELECT count(*) FROM cliente)          AS clientes,
       (SELECT count(*) FROM pago)             AS pagos_historicos,
       (SELECT count(*) FROM expediente_cobro) AS expedientes_historicos,
       (SELECT count(*) FROM bitacora)         AS asientos;

-- Quien es administrador
SELECT u.nombre_usuario, u.activo FROM usuario u JOIN rol r ON r.id = u.id_rol
 WHERE r.codigo = 'administrador';
```

`npm run migrar:estado` informa lo mismo sin tocar nada.

### Pruebas manuales en el navegador

Contraseña de todas las cuentas sembradas: `ServiTotal.2026`.

1. **Jefatura de atención** (rol `jefe_atencion_cliente`):
   1. En *Clientes*, abra un cliente desde su nombre.
   2. Pulse «Nueva orden para este cliente»: debe aparecer ya elegido.
   3. Pulse «Cambiar de cliente»: debe volver el buscador.
2. **Registrar duplicados:** registre un cliente con el teléfono de otro. Debe ofrecer abrir la ficha existente o confirmar.
3. **Baja de cliente:** desactívelo desde la ficha, con motivo. Ya no aparece en la búsqueda («Solo activos») y no admite órdenes nuevas. Reactívelo.
4. **Límites de la jefatura** (*Administración › Usuarios*): el rol «administrador» no aparece en las opciones, y su propio rol no se puede cambiar.
5. **Administrador** (rol `administrador`): en *Administración › Roles y permisos*, edite un rol con motivo y vea la bitácora.
6. **Gestor de técnicos:** en *Excepciones*, abra una. Debe mostrar la lectura, las advertencias si las hay y los «Datos técnicos» plegados. Resolver pide al menos 10 caracteres y confirmación.

---

## 7. Resultado de la verificación

Ejecutado en Linux, contra PostgreSQL 16 local, sobre la base de pruebas sembrada (no la de trabajo):

| Verificación | Resultado |
|---|---|
| `npm run verificar-tipos` (compartido, servidor, pruebas, panel) | sin errores |
| `npm run construir -w panel` (tsc + vite build) | correcto |
| `npm run prueba` (servidor: unidad + integración) | **38 archivos, 509 pruebas, todas aprobadas** |
| `npm run prueba -w panel` | **114 pruebas aprobadas** |
| Recorrido en navegador (Chromium, Playwright) | ficha → «Nueva orden» con el cliente elegido; «Cambiar de cliente» devuelve el buscador; pestañas de administración según el rol; 50 permisos editables para el administrador; detalle de excepción con lectura y datos técnicos plegados; sin errores de consola ni respuestas 5xx |

No se probó en Windows: los comandos de la sección 6 son los equivalentes de los que se ejecutaron.

---

# Tercera etapa · Técnicos, asignación, «autorizada», bitácora y garantías

Commit `c65c920` sobre la misma rama. **Único cambio de esquema: la migración
`0024_estado_autorizada.sql`**, que solo agrega el valor `autorizada` al
enumerado `estado_orden`, justo después de `esperando_autorizacion`
(autorizado expresamente). No reescribe ni borra filas; la reversión manual
está en `base-datos/reversiones/0024_revertir.sql`. Todo lo demás reutiliza
tablas existentes.

## A. Causas encontradas

| Problema | Causa real |
|---|---|
| No había dónde gestionar técnicos | No existía ningún endpoint ni pantalla para la tabla `tecnico`; solo los creaba la siembra. |
| Tras asignar, el selector volvía a «Elija…» | `DetalleOrden.tsx` limpiaba la selección después de guardar y dejaba **deshabilitada** la opción del técnico asignado; no mostraba lo guardado. Los botones de estado salían de `destinosPosibles`, que no considera ni al usuario ni los requisitos. |
| «Esta orden la tiene jefe_tecnicos…» | En `asignada` y `en_cola_taller` el responsable era solo el **rol** `jefe_tecnicos`. El `gestor_tecnicos`, que es quien asigna (`ordenes.asignar`), no podía mandar la orden a ruta. El rol `administrador` no coincidía con ningún responsable y no podía mover ninguna orden. Bloqueo en el **backend** (la máquina de estados); el panel ofrecía el botón igual. |
| `agente_telefonia` en mensajes | Es el responsable declarado de `registrada`, `esperando_autorizacion` y `finalizada`; el mensaje mostraba el código del rol. Regla correcta, mensaje defectuoso. |
| El técnico reemplazado seguía moviendo la orden | Al reasignar no se actualizaba `id_responsable_actual`, que seguía apuntando al técnico anterior. |
| No se podía cotizar ni registrar la decisión del cliente | Ningún endpoint escribía en `cotizacion`; el diagnóstico solo entraba por la cola móvil. La transición `en_diagnostico → cotizada` exigía una cotización imposible de registrar. |
| Fechas de garantía | La garantía del proveedor se calculaba solo con fecha de compra + meses de la regla; la tabla `cobertura` ya admitía períodos por artículo, pero el motor solo los usaba para la adicional. |
| «Corregir con motivo» en la ficha del artículo | Botón deshabilitado sin función, aunque el endpoint `PUT /articulos/:id/datos-sensibles` existía. |

## B. Lo implementado

### Técnicos (`/tecnicos`, módulo de seguridad, tabla `tecnico` existente)
- **Listar y buscar.** Búsqueda por texto, modalidad (ruta o planta) y estado laboral (activos, de baja, todos), con órdenes abiertas y estado de la cuenta.
- **Ver.** Muestra sus órdenes abiertas, sus visitas programadas y las piezas que tiene en su bodega.
- **Registrar**, con cuenta nueva (se crea con el rol `tecnico_ruta` o `tecnico_planta`) o enlazando una cuenta existente con ese rol.
  - Valida la especialidad contra `categoria_articulo`.
  - Rechaza duplicados (`TECNICO_DUPLICADO`).
  - Crea su bodega de vehículo o de banco.
- **Editar** especialidad, disponibilidad, nombre y modalidad.
  - Cambiar la modalidad cambia el rol de la cuenta.
  - Exige motivo y que el técnico no tenga órdenes abiertas.
- **Dar de baja** sin borrar nada:
  - Si tiene órdenes abiertas o visitas programadas, exige un técnico de reemplazo y el permiso `ordenes.asignar`.
  - Cada orden se reasigna con el servicio de siempre y su motivo queda en el historial.
  - Cada visita se reprograma al reemplazo en la misma fecha y franja.
  - No se da de baja con piezas en su bodega, que primero deben devolverse.
- **Reactivar.**
- **Estados separados:** dar de baja al técnico no desactiva su cuenta, y viceversa.
- **Permisos:** administra quien tiene `seguridad.usuario.gestionar`; consulta además quien tiene `ordenes.asignar`. Todo queda en la bitácora.

### Asignación y transiciones
- **Despacho.** Quien tiene `ordenes.asignar` da los pasos de despacho:
  - `registrada → asignada`;
  - `asignada → en_ruta / en_cola_taller`;
  - `en_cola_taller → en_diagnostico`;
  - `autorizada → asignada`.
- **Administrador.** Pasa la regla del responsable.
- **Requisitos para todos.** Evidencia, técnico, visita, diagnóstico, cotización y repuestos se exigen igual a todos. Un agente telefónico sigue sin poder despachar, y el despacho no da los pasos del técnico.
- **Acciones en la ficha.** La ficha incluye `acciones`: cada destino evaluado para el usuario por la misma máquina de estados que decide al mover. El panel muestra solo las permitidas y explica las demás.
- **Selector de técnico.** Muestra el técnico guardado (aunque esté inactivo) y el aviso con la respuesta real del backend. Reasignar exige motivo y confirmación.

### Estado `autorizada`
- **Flujo.** `cotizada → esperando_autorizacion → autorizada →` siguiente etapa:
  - **visita particular sin diagnóstico:** `asignada`;
  - **reparación autorizada:** `en_reparacion` o `esperando_repuesto`.

  Nada avanza solo: la autorización no programa visitas, no recibe repuestos ni repara.
- **Quién autoriza.** `esperando_autorizacion → autorizada` es el botón **«Autorizar orden»**. Solo lo da quien tiene `taller.cotizacion.autorizar`; el responsable del estado no basta si le falta ese permiso. El evento registra quién, cuándo (hora del servidor) y con qué base se autorizó.
- **Requisitos de la autorización:**
  - si hay cotización o diagnóstico: cotización aceptada;
  - si es una **visita particular a domicilio con cargo de visita** y sin diagnóstico: pago registrado en la bitácora y confirmado por **otra persona** con `taller.cotizacion.autorizar`;
  - en cualquier otro caso no hay requisito de pago, y la orden no queda bloqueada.
- **Entrada a «esperando autorización».** Esa visita particular puede entrar desde `registrada` o `asignada`; las demás órdenes llegan desde la cotización.
- **Cambio de comportamiento justificado.** Una reparación **particular** ya no puede saltar de `cotizada` o `en_diagnostico` a `en_reparacion` o `esperando_repuesto`: debe pasar por la autorización. Las cubiertas por garantía no cambian.
- **Reconocimiento del estado.** Etiquetas, filtros (generados del enumerado), portal del cliente, mensajes del técnico y el reporte de retrasadas reconocen `autorizada`.
- **Sin plazo.** No se definió una **regla de plazo** para `autorizada`: es un parámetro de negocio y las reglas de plazo las carga la siembra. Mientras no exista, una orden en `autorizada` no tiene plazo vencible. **Pendiente de decisión de negocio.**

### Diagnóstico, cotización y no cobertura
- **Endpoints**, sobre las tablas existentes `diagnostico` y `cotizacion`:
  - `GET /ordenes/:id/taller`;
  - `POST /ordenes/:id/diagnostico`;
  - `POST /ordenes/:id/cotizaciones`;
  - `POST /ordenes/:id/cotizaciones/decision`.
- **Exclusión en el diagnóstico.** Si el diagnóstico registra una exclusión (golpe, mal uso) o la regla excluye la falla, la orden pasa a `particular`. El evento dice de qué garantía venía y por qué. La **modalidad** (ruta o taller) no cambia, y no se inventan coberturas, cotizaciones ni pagos.

### Bitácora
- **Endpoint.** `POST /ordenes/:id/bitacora` con `{ texto, tipo? }`.
- **Almacenamiento sin tabla nueva.** Es un asiento de la tabla `bitacora` (`tabla='orden_servicio'`, `campo='bitacora…'`), protegida por el disparador de solo agregar de la migración 0023.
- **Autor y fecha** los pone el servidor; un `autor` o `momento` enviados se ignoran. Validado por prueba.
- **Correcciones.** Se corrige con otra entrada que apunta a la corregida.
- **Panel.** Botón «Registrar bitácora» en el historial: ventana modal con texto, Guardar y Cancelar. La tabla se actualiza sin recargar y muestra el tipo **BITÁCORA**, el texto y el autor real.
- **Constancia de pago.** Para la constancia de pago, el modal ofrece marcar la entrada como «Registro del pago» o «Confirmo el pago», solo en visitas particulares con cargo. Así se distingue de forma fiable la confirmación válida de un comentario común, sin convertir la bitácora en un módulo de pagos.
- **Quién puede escribir.** Escribe quien opera órdenes: `ordenes.crear`, `ordenes.asignar`, `ordenes.cerrar`, `ordenes.entregar`, `taller.diagnostico.registrar`, `campo.evidencia.cargar`, `inventario.solicitud.gestionar` y `taller.validacion.registrar`. El usuario de consulta no escribe.
- **Mejora propuesta (requiere autorización):** un permiso propio `ordenes.bitacora.registrar`. Cambiaría el catálogo sembrado, por eso no se hizo.

### Garantías por artículo
- **Una sola decisión.** La garantía de proveedor registrada en la ficha (tabla `cobertura`) **manda** sobre el cálculo por meses de la regla. Si no hay ninguna registrada, se calcula como antes. Es la misma máquina de decisión, no un sistema paralelo.
- **Resumen en la evaluación.** `POST /coberturas/evaluar` devuelve, para la garantía del proveedor y la adicional:
  - la **vigencia** (vigente, vencida o no registrada) y la fecha de vencimiento;
  - si se calculó por la regla o está registrada;
  - si **aplica** al solicitante y el motivo si no aplica.
- **Nueva orden.** Muestra ese estado y pregunta la modalidad: garantía del proveedor, garantía adicional o servicio particular.
  - El servidor rechaza una garantía vencida o ajena (`GARANTIA_NO_APLICABLE`).
  - Particular siempre se puede elegir.
  - Si no se envía la elección (la cola móvil), decide el motor, como antes.
- **Ficha del artículo:**
  - registrar las fechas de garantía de proveedor o adicional, con documento;
  - corregir una garantía: desactivarla con motivo (`POST /articulos/:id/coberturas/:idCobertura/desactivar`, auditado) y registrar la correcta;
  - corregir la fecha de compra con motivo.
- **Órdenes cerradas.** Nunca cambian. Las abiertas del artículo se reevalúan al registrar o corregir una cobertura; es la regla existente (`reevaluarOrdenesAbiertas`), no se agregó.
- **Reglas de garantía.** No se eliminaron. Siguen aportando:
  - los meses cuando no hay fecha registrada;
  - la exigencia de tienda del grupo;
  - las fallas excluidas que usa el diagnóstico;
  - la versión que cada orden congela.

  Ninguna configuración quedó innecesaria.

## C. Seguridad y consistencia
- **Comprobación en el servidor.** Todas las reglas anteriores las comprueba el servidor. El panel solo refleja las acciones que el servidor evaluó.
- **Autoría desde la sesión.** La identidad de quien autoriza, comenta, confirma un pago o reasigna sale de la sesión.
- **Atomicidad.** Las operaciones críticas van en transacción. La baja de un técnico con sus reasignaciones y reprogramaciones es atómica: si una visita choca de franja, no se aplica nada.
- **Concurrencia.** La autorización y la confirmación de pago toman la orden con `FOR UPDATE`, así que dos confirmaciones simultáneas quedan en fila.

## D. Siembra
- **Cambio en el código.** En `distribucion-estados.ts` y `responsables.ts` se agregó solo la clave `autorizada` (con 0 órdenes y sin responsable), porque los mapas están tipados con `Record<EstadoOrden, …>`.
- **Verificación.** Se ejecutó la siembra **anterior** (commit `5c3a6c8`) y la **nueva** con la misma fecha fija (`2026-10-09T12:00Z`) en dos bases nuevas. La huella de órdenes, eventos, clientes, usuarios, técnicos, movimientos, reglas de plazo, excepciones y bitácora fue **idéntica**.
- **Fecha de ejecución.** La siembra usa la fecha del día, así que dos ejecuciones en días distintos difieren aunque el código sea el mismo.
- **Prueba de la siembra.** `distribucion-estados.prueba.ts` ahora recorre solo los estados que la siembra genera.

## E. Pruebas de esta etapa
- **Integración.** `flujo-comercial.prueba.ts`, 20 casos contra API y PostgreSQL:
  - asignación y reasignación con historial;
  - responsable tras reasignar;
  - despacho por el gestor y bloqueo del agente;
  - acciones del panel iguales al backend;
  - límites del administrador;
  - cotización, autorización explícita y comentario que no autoriza;
  - autorización que no crea visita;
  - garantía vencida rechazada y particular a domicilio;
  - fechas registradas que mandan;
  - órdenes cerradas intactas;
  - golpe que pasa a particular sin cambiar la modalidad;
  - visita con pago registrado y confirmado por otra persona (y rechazo de la confirmación propia);
  - orden sin pago previo no retenida;
  - bitácora: autor y hora del servidor, vacío rechazado, consulta 403, inmutable y corrección;
  - técnicos: alta, duplicado, especialidad inválida, permisos, edición, baja bloqueada sin reemplazo, baja con reasignación e historial, reactivación.
- **Unidad.** Máquina de estados: autorizar solo con el permiso, el destino `autorizada` no avanza solo, pago confirmado por otra persona, despacho, administrador.
- **Prueba de migraciones.** Ahora espera 14 estados, con `autorizada` en su posición.

## F. Pendientes y dependencias
- **Plazo de `autorizada`.** Definir el plazo (`regla_plazo`) para el estado nuevo; es una decisión de negocio.
- **Permiso de bitácora.** Si se quiere, un permiso propio `ordenes.bitacora.registrar`; requiere cambiar el catálogo sembrado.
- **Técnicos y zonas.** No existe una relación técnico–zona en el esquema; no se inventó.
- **Selección de modalidad elegida a mano.** La reevaluación de órdenes abiertas al registrar una cobertura (regla existente) puede cambiar una modalidad elegida a mano en una orden aún abierta. Si eso no es deseable, hace falta marcar en la orden que la modalidad fue elegida, lo que requiere una columna nueva y autorización.

## G. Resultado de la verificación (tercera etapa)

Ejecutado en Linux con PostgreSQL 16 local, sobre bases de prueba (nunca la de trabajo):

| Verificación | Resultado |
|---|---|
| `npm run verificar-tipos` | sin errores |
| `npm run construir -w panel` | correcto |
| `npm run prueba` (servidor) | **39 archivos, 540 pruebas, todas aprobadas** |
| `npm run prueba -w panel` | **114 pruebas aprobadas** |
| Migración 0024 sobre la base de desarrollo (30 000 órdenes) | aplicada; 30 000 órdenes intactas; `autorizada` entre `esperando_autorizacion` y `esperando_repuesto` |
| Siembra anterior vs. nueva, misma fecha fija | huellas idénticas |
| Navegador (Chromium) | asignar muestra el técnico guardado; «Registrar bitácora» guarda y aparece como BITÁCORA con el autor real; «Autorizar orden» explica lo que falta; pestaña Técnicos; nueva orden con estado de garantías y modalidad; sin errores de consola ni 5xx |

No se probó en Windows; los comandos de la sección 6 siguen valiendo
(`npm run migrar` aplica la 0024).

---

# Cuarta etapa · Modalidad de servicio, visitas con horas reales y garantía adicional por meses

**Sin cambios de esquema ni migraciones**, y sin tocar la siembra: no se modificó ningún archivo de `servidor/src/infraestructura/semillas/` ni de `base-datos/`.
Se reutilizaron:
- `orden_servicio.modalidad` (`ruta`/`taller`);
- la tabla `visita`, que ya tenía `hora_llegada`, `hora_salida`, `resultado` y `motivo`;
- la tabla `cobertura`, para la garantía adicional.

## Lo que faltaba o fallaba

| Problema | Causa |
|---|---|
| Modalidad poco clara al crear la orden | Era un desplegable con «Ruta» preseleccionado; no se elegía de forma explícita y las visitas no se podían programar desde el alta. |
| No se podía registrar llegada y salida desde el panel | Solo la cola del móvil cerraba la visita, de una vez, con las horas del dispositivo. |
| Una segunda visita era imposible | Una visita realizada sigue «vigente», y programar otra chocaba con ella («ya tiene una visita programada»). |
| Se podía programar visita a una orden de taller o cerrada | `programarVisita` no miraba la modalidad ni el estado. |
| Un técnico veía en la agenda las visitas de todos | `GET /agenda` no aplicaba el cerco por técnico. |
| Conteos de la agenda incompletos | Se contaban en el navegador sobre la página visible y faltaban «realizadas», «en curso» y «no autorizadas». |
| Vencimientos a fin de mes | El resumen de garantías sumaba meses con `setUTCMonth`, de modo que el 31 de enero más un mes daba el 3 de marzo. Además, una póliza dejaba de valer a las 00:00 de su último día. |

## Lo implementado

### Modalidad de servicio (sección 22)
- **Selección obligatoria en «Nueva orden».** «4 · Modalidad de servicio» es una tarjeta visible con dos opciones: **Visita a domicilio (ruta)** y **El cliente lleva el artículo al taller**. No hay valor por defecto; sin elegir, no se puede guardar.
- **Ruta.** Pide dirección y teléfono (obligatorios), referencia, zona, fecha y franja.
  - **Técnico.** El técnico se ofrece solo a quien despacha (`ordenes.asignar` y `agenda.programar`). Si se indica, el servidor **asigna y programa la visita en la misma transacción**: si la franja del técnico está ocupada, no se crea nada (verificado en el navegador).
  - **Fecha solicitada.** Sin técnico, la fecha y franja quedan anotadas en el evento de registro como solicitud del cliente.
  - **Dirección.** El servidor exige la dirección de la visita.
- **Taller.** No pide dirección ni franja. El servidor **rechaza** una visita en una orden de taller (400 al crear, `ORDEN_DE_TALLER` al programar).
- **Detalle de la orden.** La cabecera muestra «Modalidad de servicio» y, aparte, «Garantía (quién paga)»: son independientes.

### Visitas y horas reales (sección 23)
- **Endpoints.** `POST /visitas/:id/llegada` y `POST /visitas/:id/salida` (`{ resultado, observaciones }`).
  - **Horas.** Llegada y salida las pone el reloj del servidor y no se sobrescriben (`LLEGADA_YA_REGISTRADA`). La salida exige la llegada (`SIN_LLEGADA`). Una visita con resultado no se modifica (`VISITA_YA_REGISTRADA`).
  - **Quién registra.** Las registra el técnico de esa visita o quien programa la agenda; otro técnico recibe un rechazo.
  - **Observaciones.** Se guardan en `visita.motivo`, la columna existente para «reprogramación o visita fallida».
- **Varias visitas por orden.** Ahora solo choca con una visita **pendiente** (vigente y sin resultado). La realizada conserva su llegada, salida, resultado y observaciones, y aparece en el historial como «Llegada al domicilio» y «Resultado de la visita».
- **Agenda.** Consulta por rango de fechas y técnico (ruta y planta), con horas programadas y reales, observaciones y las acciones de llegada y salida.
  - Un técnico solo ve sus visitas.
  - Conteos del servidor (`GET /agenda/resumen`) sobre todas las visitas vigentes del filtro: programadas, en curso, realizadas, resueltas en sitio, requieren traslado, cliente ausente y no autorizadas.
- **Pestaña «Visitas» de la orden.** Muestra cada visita con su técnico, horas reales, resultado y observaciones, y permite programar la siguiente. En taller explica que no lleva visita.
- **Requisito «tiene visita programada».** El requisito para pasar a `en_ruta` cuenta solo una visita pendiente.
- **Sin cambios en estados, resultados ni tablas.** Las evidencias obligatorias siguen las reglas existentes de evidencia por estado.

### Garantía adicional por meses (sección 24)
- **Cálculo único.** `compartido/src/dominio/fechas.ts`, función `ultimoDiaCubierto`, es la misma regla del motor de garantías: cubre mientras no se cumplan los N meses. El último día cubierto es:
  - el anterior al mismo día N meses después;
  - o el último día del mes si ese día no existe. Por ejemplo, del 31 de enero más un mes resulta el 28 o 29 de febrero, y del 29 de febrero más 12 meses, el 28 de febrero.
  - **Mismo cálculo en los dos lados.** Lo usan el servidor (que decide) y el panel (vista previa).
  - **Coincidencia con la regla.** Una prueba compara el resultado con `mesesTranscurridos` del motor.
- **Alta del artículo.** Acepta `garantiaAdicional: { fechaContratacion, meses }` de forma opcional: sin ella no se piden fechas.
  - **Vencimiento.** Lo calcula el servidor.
  - **Validaciones:** meses de 1 a 120, fechas reales del calendario, sin fechas futuras, y contratación no anterior a la compra.
- **Ficha del artículo.** Registrar una garantía admite `meses` en lugar de la fecha de fin, y el servidor la calcula.
- **Presentación por separado.** En la ficha del artículo y al crear la orden, proveedor (fabricante) y adicional aparecen por separado, cada una con desde (compra o contratación), meses, vencimiento y vigencia (vigente, vencida o no registrada). Los meses se deducen de las fechas; no se guardó ninguna columna nueva.
- **Vigencia por día.** Se compara por día de calendario: el último día cubre entero.
- **Historial.** Las órdenes anteriores no cambian: conservan la garantía con la que se atendieron.

## Verificación (sección 25)

| Caso | Prueba |
|---|---|
| 1-3 Crear ruta y taller, campos y acciones de cada una | integración y navegador |
| 4 Programar visita con fecha y franja | integración y navegador |
| 5 Llegada y salida reales | integración y navegador |
| 6 Visitas anteriores de la misma orden | integración (dos visitas, la primera intacta) |
| 7 Técnico correcto | integración (técnico ajeno rechazado; la agenda del técnico solo trae las suyas) |
| 8-9 Artículo sin y con garantía adicional | integración |
| 10-11 Vencimiento y fin de mes | unidad (`fechas-garantia.prueba.ts`) e integración (31/01 + 13 → 28/02) |
| 12 Garantías al crear la orden | integración y navegador |
| 13 Modalidad de servicio frente a garantía | integración (ruta y taller particulares) y pantalla |

### Resultados

| Verificación | Resultado |
|---|---|
| `npm run verificar-tipos` | sin errores |
| `npm run construir -w panel` | correcto |
| `npm run prueba` (servidor) | **41 archivos, 558 pruebas, todas aprobadas** (nuevas: `modalidad-visitas-garantia.prueba.ts`, 13; `fechas-garantia.prueba.ts`, 5) |
| `npm run prueba -w panel` | **114 aprobadas** |
| Navegador (Chromium) | sin errores de consola ni respuestas 5xx; franja ocupada rechazada sin dejar una orden a medias |

### Pendiente o a decidir
- **Fecha solicitada sin técnico.** Queda solo en el evento de registro de la orden; no hay una columna «fecha solicitada». Si se quiere filtrar por ella en la agenda, hace falta una columna (cambio de esquema, requiere autorización).
- **Observaciones de la visita.** Se guardan en `visita.motivo`. Si se reprograma una visita ya cerrada, no se toca, porque solo se reprograman visitas pendientes.
