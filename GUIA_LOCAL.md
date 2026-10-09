# Correr ServiTotal en su computadora

Guía de principio a fin: de un repositorio recién clonado a los cuatro
componentes andando. Los pasos están probados en Linux; al final hay notas
para Windows y macOS.

---

## 1. Lo que necesita instalado

| Programa | Versión | Cómo comprobar |
|---|---|---|
| Node.js | 20.12 o superior | `node --version` |
| PostgreSQL | 14 o superior | `psql --version` |
| Git | cualquiera | `git --version` |

> **Node 20.12 es el mínimo real**, no 20.0: el sistema lee el archivo `.env`
> con `process.loadEnvFile`, que apareció en esa versión. Con una anterior
> arrancaría sin configuración y fallaría al conectarse a la base.

**No hace falta nada más.** No hay aplicación que instalar: el técnico usa el
mismo sistema web desde el navegador de su celular. Si quiere probar esa parte,
le basta el teléfono que ya tiene en la mano.

---

## 2. Traer el código e instalar dependencias

```bash
git clone https://github.com/Alejandro-RG20/SistemaGestionDeOrdenes.git
cd SistemaGestionDeOrdenes
git checkout claude/sistema-web-responsive
npm install
```

`npm install` instala las tres partes de una sola vez: son un espacio de
trabajo de npm (`compartido`, `servidor`, `panel`). Tarda un par de minutos la
primera vez.

También **compila `compartido`**, que es el paquete de contratos que los otros
dos importan. Si no estuviera compilado, la siembra fallaría con
`Cannot find module '@servitotal/compartido'`; se hace solo para que no sea un
paso que haya que recordar. Si alguna vez necesita rehacerlo a mano:

```bash
npm run construir
```

---

## 3. Preparar la base de datos

```bash
createdb servitotal
```

Si `createdb` pide usuario o no existe, use `psql`:

```bash
psql -U postgres -c "CREATE DATABASE servitotal;"
```

Las migraciones crean tres extensiones — `uuid-ossp`, `pg_trgm` y `unaccent` —
y eso **exige un usuario con permisos de superusuario**. Con el usuario
`postgres` por defecto funciona. Si su PostgreSQL usa otro, désele el permiso
o use `postgres` sólo para esta parte.

---

## 4. Configurar el entorno

```bash
cp .env.ejemplo .env
```

Abra `.env` y ajuste **dos cosas**:

```ini
DATABASE_PASSWORD=lo_que_tenga_su_postgres
JWT_SECRET=una-clave-larga-generada-al-azar
```

> Los nombres en español (`BD_CONTRASENA`, `JWT_SECRETO`, `PUERTO`) también
> funcionan, por si tiene un `.env` de antes. Si define los dos, manda el del
> pliego.

Para el secreto:

```bash
openssl rand -base64 48
```

Debe tener **al menos 32 caracteres**; el servidor se niega a arrancar con uno
más corto, y hace bien.

Si su PostgreSQL no está en el puerto 5432, cambie también `DATABASE_PORT`.

El resto de valores sirven tal cual. `ALMACEN_OBJETOS_RAIZ` apunta a
`./datos/evidencias`, una carpeta del propio proyecto que se crea sola y está
en `.gitignore`: ahí van los archivos de evidencia, que **nunca** entran en la
base de datos.

---

## 5. Crear las tablas y los datos de prueba

```bash
npm run migrar     # aplica las 23 migraciones, cada una en su transacción
npm run sembrar    # genera doce meses de operación
```

La siembra tarda unos 20–25 segundos y genera, entre otras cosas:

- 3 000 clientes, 5 000 artículos y **30 000 órdenes** repartidas en los 13
  estados
- ~167 000 evidencias, ~36 000 movimientos de repuesto, solicitudes de
  repuesto y una bodega personal por técnico
- 37 usuarios, uno por cada persona del centro

Es **reproducible**: con la misma `SEMILLA_DATOS` salen exactamente los mismos
datos. Para empezar de cero, `npm run sembrar` vacía y vuelve a generar.

Para comprobar que todo quedó bien:

```bash
npm run migrar:estado
```

---

## 6. Arrancar la API

```bash
npm run desarrollo
```

Queda escuchando en `http://localhost:3000` y recarga sola al guardar. En otra
terminal:

```bash
curl http://localhost:3000/api/v1/salud
# {"datos":{"estado":"disponible"}}
```

Deje esta terminal abierta. Todo lo demás habla con ella.

---

## 7. Arrancar el panel web

En una **segunda terminal**, desde la misma carpeta:

```bash
npm run panel
```

Abra **http://localhost:5173**.

### Con qué cuenta entrar

Todos los usuarios sembrados comparten la contraseña **`ServiTotal.2026`**.
Según con cuál entre, verá un panel distinto — que es justamente la gracia:

| Usuario | Rol | Qué verá |
|---|---|---|
| `nhernandez` | jefa de atención al cliente | **todo** lo operativo; administra el sistema, recibe y entrega |
| `abermudez` | administrador | acceso global |
| `nflores` | jefe de técnicos | asignación, órdenes vencidas, excepciones, **validación técnica** |
| `hflores` | gestor de técnicos | asignación de técnicos y agenda |
| `brodriguez` | técnico de ruta | **sólo sus órdenes**; pide repuestos, registra su uso y devuelve lo que sobra |
| `bperez` | técnico de planta | lo mismo, desde su bodega de banco del taller |
| `gramirez` | bodeguero | solicitudes de repuesto (revisar, reservar, entregar), disponibilidad, kardex |
| `aobando` | jefe de compras | **pedidos al proveedor**, sin poder recibirlos |
| `bzeledon` | agente de telefonía | clientes, órdenes, agenda |
| `csilva` | usuario de tienda | **sólo las órdenes de su sucursal**; recibe y entrega |
| `egonzalez` | usuario de consulta | lee y nada más |

No hay cuentas de cobros: el sistema dejó de gestionar dinero (migración 0023).

### Tres comparaciones que vale la pena hacer

1. Entre con `aobando` y luego con `gramirez`, y abra la **misma compra**. El
   jefe de compras ve el bloque para mover el pedido y no el de recibir; el
   bodeguero, al revés. Quien pide no cuenta lo que llega.
2. Entre con `csilva` y mire el total de la bandeja, luego con `abermudez`.
   El usuario de tienda ve unas nueve mil órdenes —las de su sucursal— y el
   administrador las treinta mil.
3. Entre con `nflores` en **Validación técnica** y abra una orden a la que le
   falte evidencia: la opción de aprobar **no está**, y en su lugar se explica
   por qué y qué hacer.

Entre con `nflores` y luego con `brodriguez` y compare la bandeja: el jefe ve unas
doscientas órdenes vencidas —las del taller entero— y el técnico ve un puñado,
que son las suyas. Esa diferencia es la razón de ser de la pantalla: siendo el
único canal de aviso del sistema, una bandeja llena de problemas ajenos se
deja de mirar.

> Los nombres de usuario se generan a partir de la semilla. Si cambió
> `SEMILLA_DATOS` serán otros; para verlos:
> ```bash
> psql -U postgres -d servitotal -c "SELECT r.codigo, u.nombre_usuario FROM usuario u JOIN rol r ON r.id=u.id_rol ORDER BY r.codigo;"
> ```

---

## 8. Probar el portal público del cliente

No necesita cuenta. Vaya a **http://localhost:5173/consulta**.

Le pide **número de orden y teléfono**. Saque un par de la base:

```bash
psql -U postgres -d servitotal -tAc \
  "SELECT numero, telefono_contacto FROM orden_servicio WHERE estado='esperando_repuesto' LIMIT 3;"
```

Vale el teléfono con guiones, con espacios o con código de país: se comparan
sólo los dígitos.

Pruebe también a **equivocarse de teléfono**: responde lo mismo que si la
orden no existiera. Es a propósito — si dijeran cosas distintas, probando
números se sabría qué órdenes existen.

---

## 9. Abrir el sistema desde el celular del técnico

**No hay nada que instalar.** El técnico entra a la misma dirección del
sistema desde el navegador de su teléfono. Sólo hace falta que el teléfono y su
computadora estén **en la misma red WiFi**.

Averigüe la IP de su computadora:

```bash
hostname -I | awk '{print $1}'      # Linux
ipconfig getifaddr en0              # macOS
ipconfig                            # Windows: la IPv4 del adaptador WiFi
```

Arranque el panel escuchando en toda la red, no sólo en su máquina:

```bash
npm run panel -- --host
```

Y desde el teléfono, abra `http://192.168.1.50:5173` (con su IP). Entre con un
técnico de ruta —por ejemplo `brodriguez`, misma contraseña— y toque **Mi
ruta (celular)** en el menú.

### Autorizar el teléfono antes de que pueda enviar

La primera vez, el sistema le va a decir al técnico que **ese navegador todavía
no está autorizado**, y le va a mostrar un código `web-…`. Eso es a propósito:
es la misma regla que permitía revocar a distancia una tableta perdida
(RF-05), aplicada al navegador.

Entre con la jefatura de atención al cliente (`nhernandez`), vaya a
**Administración › Dispositivos de campo**, elija al técnico, pegue el código
y pulse *Autorizar este dispositivo*. El técnico cierra sesión, vuelve a
entrar, y ya sincroniza.

Mientras no esté autorizado, **su trabajo no se pierde**: se guarda en el
teléfono y sube en cuanto se autorice.

### Probar que de verdad funciona sin señal

1. Con señal, baje la ruta del día desde *Mi ruta*.
2. Ponga el teléfono en **modo avión**.
3. Registre un diagnóstico, tome una fotografía de evidencia y descargue un
   repuesto. La barra de arriba pasa a `Sin señal · N sin enviar`.
4. Quite el modo avión. **No toque nada**: la cola se vacía sola.

> **Para la fotografía de evidencia hace falta HTTPS**, o `localhost`. La
> huella SHA-256 se calcula con `crypto.subtle`, que el navegador sólo ofrece
> en contexto seguro; por `http://192.168.1.50` el resto del sistema funciona
> pero la captura de evidencia avisa de que no puede. En el centro, el panel
> se sirve por HTTPS y el problema no existe.

---

## 10. Correr las pruebas

```bash
npm run prueba          # las del servidor (necesita PostgreSQL andando)
npm run prueba:panel    # las de la web, incluida toda la capa sin conexión
```

La primera corrida siembra una base plantilla (`servitotal_pruebas_plantilla`,
unos cinco minutos) y cada archivo de pruebas arranca de una copia de ella en
segundos. La plantilla se vuelve a sembrar sola cuando cambian las
migraciones, la siembra o el dominio compartido. Crean y destruyen
`servitotal_pruebas`; **nunca tocan su base de desarrollo**.

Si no tiene PostgreSQL a mano:

```bash
npm run prueba:unidad   # sólo las que no necesitan base
```

---

## Si algo falla

| Síntoma | Qué pasa |
|---|---|
| `connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está corriendo, o `BD_PUERTO` no es el suyo |
| `Falta la variable de entorno ...` | No copió `.env.ejemplo` a `.env`, o lo dejó incompleto |
| `permission denied to create extension` | El usuario de `BD_USUARIO` no es superusuario |
| `JWT_SECRETO` rechazado | Tiene menos de 32 caracteres |
| El panel carga pero todo da error de red | La API no está corriendo en el 3000 |
| Desde el teléfono no carga la web | Arranque el panel con `npm run panel -- --host` y use la IP de su computadora, no `localhost`: desde el teléfono, `localhost` es el teléfono |
| El técnico registra trabajo y no sube nunca | Ese navegador no está autorizado. La pantalla le muestra el código `web-…`; autorícelo en Administración › Dispositivos de campo |
| «No se puede calcular la huella… no es HTTPS» | Es correcto y es de seguridad del navegador. Pruebe la captura de evidencia desde `localhost`, o sirva el panel por HTTPS |
| `Cannot find module '@servitotal/compartido'` | Faltó `npm install` en la raíz, o se instaló dentro de un subproyecto. Se arregla con `npm run construir` |

Para empezar de cero sin reinstalar nada:

```bash
npm run sembrar    # vacía y regenera los datos
```

---

## Lo que se agregó al sistema

Si viene de una versión anterior, estas son las secciones nuevas del menú:

| Sección | Quién la ve | Para qué |
|---|---|---|
| **Validación técnica** | jefe de técnicos | revisar el trabajo antes de darlo por bueno |
| **Compras y proveedores** | compras y bodega | pedir al proveedor y registrar lo que llega |
| **Reportes** | jefaturas | los 17 reportes del pliego, en una pantalla |
| **Tiendas** | administración | las sucursales desde las que entra el trabajo |

Y dentro de cada orden hay dos botones nuevos: **Revisar el trabajo** y
**Entregar el artículo**, según el permiso de quien mire.

Además, el número de orden ahora es **`OS-2026-000123`**. La búsqueda de la
bandeja y el portal del cliente aceptan las dos formas —el código completo o el
número suelto— porque quien atiende teclea lo que el cliente le dicta.

---

## Las tres piezas, de un vistazo

```
┌─────────────────┐     ┌──────────────────┐
│  Panel web      │     │  Portal público  │   ← navegador, :5173
│  :5173          │     │  :5173/consulta  │      (el portal, sin cuenta)
└────────┬────────┘     └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
            ┌─────────────────┐
            │  API  :3000     │ ──── PostgreSQL :5432
            └────────┬────────┘
                     ▲
                     │  sincroniza al recuperar señal
            ┌────────┴────────┐
            │  La misma web   │   ← celular del técnico,
            │  en el celular  │      trabaja sin red
            └─────────────────┘
```

---

## Advertencia sobre los datos de prueba

La contraseña `ServiTotal.2026` y los 37 usuarios son **de desarrollo**. Los
nombres, teléfonos y direcciones son generados, no corresponden a personas
reales, pero el conjunto **no debe salir de un entorno de desarrollo** ni
usarse como base de un despliegue real.

---

## Notas para Windows y macOS

**Windows.** Todo funciona igual con PowerShell, con dos diferencias:

- Para pasar una variable a un comando, use `$env:`:
  ```powershell
  npm run panel -- --host
  ```
- `openssl` puede no estar. Genere el secreto con Node, que ya tiene:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- Si instaló PostgreSQL con el instalador oficial, `psql` y `createdb` no están
  en el PATH; búsquelos en `C:\Program Files\PostgreSQL\16\bin`.

**macOS.** Igual que Linux. Con Homebrew:

```bash
brew install node postgresql@16
brew services start postgresql@16
```

El usuario de PostgreSQL por defecto es su propio nombre de usuario, no
`postgres`. Ajuste `BD_USUARIO` en el `.env` o cree el rol:

```bash
createuser -s postgres
```

## Lo que se agregó en esta etapa, y cómo verlo

### El cerco por datos

Entre con un técnico (cualquiera de la lista, contraseña `ServiTotal.2026`) y
abra «Mis órdenes». Verá sus órdenes, no las treinta mil. Copie el enlace de
una orden desde una sesión de jefatura, péguelo en la sesión del técnico y
obtendrá **403** con el motivo escrito: «Esta orden no está asignada a usted».

Lo mismo por API, que es como lo ataca cualquiera:

```bash
TK=$(curl -s localhost:3000/api/v1/autenticacion/sesion -X POST \
  -H 'Content-Type: application/json' \
  -d '{"nombreUsuario":"robando","contrasena":"ServiTotal.2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["datos"]["tokenAcceso"])')

# el listado viene cercado
curl -s "localhost:3000/api/v1/ordenes?tamano=5" -H "Authorization: Bearer $TK" \
  | python3 -c 'import sys,json;print("visibles:",json.load(sys.stdin)["paginacion"]["total"])'
```

### Que el permiso de leer no mueve existencia

```bash
TK=$(curl -s localhost:3000/api/v1/autenticacion/sesion -X POST \
  -H 'Content-Type: application/json' \
  -d '{"nombreUsuario":"egonzalez","contrasena":"ServiTotal.2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["datos"]["tokenAcceso"])')

curl -s localhost:3000/api/v1/movimientos -X POST -H "Authorization: Bearer $TK" \
  -H 'Content-Type: application/json' \
  -d '{"tipo":"ingreso","idRepuesto":"…","idBodegaDestino":"…","cantidad":99}'
# → 403 SIN_PERMISO, y la existencia no se mueve
```

`egonzalez` es `usuario_consulta`. Antes esto respondía 200 y sumaba 99
unidades.

### El kardex

Menú → **Kardex**. Busque un repuesto por código o descripción y ábralo. Verá
cada movimiento con el saldo que quedó después, y el filtro de bodega cambia
el signo de cada línea: lo que es salida para la central es entrada para la
móvil.

La comprobación que vale la pena hacer: el **saldo final** del kardex de una
bodega tiene que ser igual a la cantidad que muestra la pantalla de
existencias para ese repuesto en esa bodega. Son dos caminos distintos al
mismo número.

### El recorrido de la solicitud de repuesto

Menú → **Solicitudes de repuesto**. Entre como bodeguero y verá los botones de
los pasos que le toca dar. Entre como técnico y verá solo las solicitudes de
**sus** órdenes, y el único botón que le toca: «Confirmar que la recibí».

Pruebe a confirmar como bodeguero: responde 403 con el motivo. Pruebe a
saltarse un paso (entregar algo que no está preparado): responde 422
nombrando el paso imposible.

### Movimientos

Menú → **Movimientos**. Un solo formulario, y el tipo de movimiento cambia los
campos que pide. Los tipos que aparecen en el desplegable son los que su
perfil puede registrar; con un usuario de consulta la pantalla dice por qué no
hay formulario en vez de mostrar uno que va a fallar.

### Las rutas nuevas de la API

| Método y ruta | Para qué |
| --- | --- |
| `GET /repuestos/:id/kardex` | El libro del repuesto, con saldo corrido. Admite `idBodega`, `desde`, `hasta`. |
| `GET /solicitudes-repuesto/recorrido` | Las solicitudes con su recorrido. Cercado al técnico. |
| `POST /solicitudes-repuesto/:id/pasos` | Dar un paso del recorrido del §26. |

### Las migraciones nuevas

| Migración | Qué hace |
| --- | --- |
| `0021_expediente_observado_cerrado.sql` | Agrega `observado` y `cerrado` al enumerado del expediente. No reescribe filas. |
| `0022_solicitud_repuesto_flujo.sql` | Agrega el estado y la autoría de cada paso a `solicitud_repuesto`. Traduce las filas existentes sin inventar pasos: liberada → `recibida`, el resto → `solicitada`. |

Aplicadas sobre la base de desarrollo con 11 406 solicitudes: 11 139 quedaron
en `recibida` y 267 en `solicitada`, y cero filas con el estado y `liberada`
en contradicción.

### El tablero de inicio

Entre con cualquier usuario: las once cifras de arriba son la foto de hoy.
Están cercadas, así que la comparación vale la pena: entre con `abermudez`
(administrador), con un usuario de tienda y con un técnico, y mire «Órdenes
abiertas». Deben bajar: 1 500 → 478 → 56.

Cada tarjeta con enlace abre la lista que explica el número. Las que no llevan
enlace están deshabilitadas a propósito, no es que no respondan.

### Descargar un reporte

Menú → **Reportes**, elija uno y use «Descargar en CSV». El archivo lleva los
mismos filtros de fecha que la pantalla.

Si quiere ver por qué el escapado importa, busque en el CSV una celda que
empiece con comilla simple: son las que empezaban por `=`, `+`, `-` o `@`, que
Excel ejecutaría como fórmula.

### Las alertas nuevas

Menú → **Panel principal**, debajo de las cifras. Con los datos sembrados
deberían aparecer «Cotizaciones sin respuesta del cliente» (135) y «Compras que
no han llegado completas» (17). «Repuestos agotados» no aparece porque no hay
ninguno en cero, que es la verdad de estos datos.

### Las rutas nuevas de esta etapa

| Método y ruta | Para qué |
| --- | --- |
| `GET /tablero` | Las once cifras del inicio más la actividad reciente. Cercado. |
| `GET /reportes/:clave/exportar` | El mismo reporte, como archivo CSV. |
