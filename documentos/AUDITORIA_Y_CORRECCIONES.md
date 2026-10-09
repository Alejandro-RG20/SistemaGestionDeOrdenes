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
