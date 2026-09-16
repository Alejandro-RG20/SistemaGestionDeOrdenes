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

Para la aplicación móvil, además: un teléfono o tableta Android con la app
**Expo Go**, o el emulador de Android Studio. No hace falta para el resto.

---

## 2. Traer el código e instalar dependencias

```bash
git clone https://github.com/Alejandro-RG20/SistemaGestionDeOrdenes.git
cd SistemaGestionDeOrdenes
git checkout claude/hola-af79ns
npm install
```

`npm install` instala las cuatro partes de una sola vez: son un espacio de
trabajo de npm (`compartido`, `servidor`, `movil`, `panel`). Tarda unos
minutos la primera vez, sobre todo por las dependencias de Expo.

También **compila `compartido`**, que es el paquete de contratos que los otros
tres importan. Si no estuviera compilado, la siembra fallaría con
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
BD_CONTRASENA=lo_que_tenga_su_postgres
JWT_SECRETO=una-clave-larga-generada-al-azar
```

Para el secreto:

```bash
openssl rand -base64 48
```

Debe tener **al menos 32 caracteres**; el servidor se niega a arrancar con uno
más corto, y hace bien.

Si su PostgreSQL no está en el puerto 5432, cambie también `BD_PUERTO`.

El resto de valores sirven tal cual. `ALMACEN_OBJETOS_RAIZ` apunta a
`./datos/evidencias`, una carpeta del propio proyecto que se crea sola y está
en `.gitignore`: ahí van los archivos de evidencia, que **nunca** entran en la
base de datos.

---

## 5. Crear las tablas y los datos de prueba

```bash
npm run migrar     # aplica las 14 migraciones, cada una en su transacción
npm run sembrar    # genera doce meses de operación
```

La siembra tarda unos 20–25 segundos y genera, entre otras cosas:

- 3 000 clientes, 5 000 artículos y **30 000 órdenes** repartidas en los 13
  estados
- ~167 000 evidencias, ~36 000 movimientos de repuesto, ~8 300 expedientes de
  cobro
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
| `mmorales` | jefa de atención al cliente | **todo**; administra el sistema |
| `gcruz` | jefe de técnicos | órdenes vencidas del taller, excepciones de campo |
| `ccruz` | técnico de ruta | **sólo sus órdenes**, sin cobros ni excepciones |
| `cpalacios` | gestor de cobros | expedientes bloqueados, sin respuesta, sin conformar |
| `maguirre` | bodeguero | inventario bajo mínimo y repuestos pedidos |
| `breyes` | agente de teléfonía | clientes, órdenes, agenda |

Entre con `gcruz` y luego con `ccruz` y compare la bandeja: el jefe ve unas
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

## 9. Arrancar la aplicación móvil (opcional)

La app de los técnicos corre con Expo. Necesita que su teléfono y su
computadora estén **en la misma red WiFi**.

Averigüe la IP de su computadora:

```bash
hostname -I | awk '{print $1}'      # Linux
ipconfig getifaddr en0              # macOS
ipconfig                            # Windows: la IPv4 del adaptador WiFi
```

Y arranque la app apuntando a ella:

```bash
EXPO_PUBLIC_API=http://192.168.1.50:3000/api/v1 npm run iniciar --workspace movil
```

(sustituyendo `192.168.1.50` por su IP). Aparece un código QR: escanéelo con
**Expo Go**.

Entre con un técnico — `ccruz` o `emembreno`, misma contraseña. La app baja la
jornada y a partir de ahí **funciona sin red**: apague el WiFi del teléfono,
registre un diagnóstico o un consumo de repuesto, y vuelva a encenderlo. Lo
que registró sube solo, sin duplicarse.

> En el **emulador de Android** no hace falta la IP: el valor por defecto
> (`10.0.2.2`) ya apunta a la máquina que lo hospeda.

---

## 10. Correr las pruebas

```bash
npm run prueba          # 369 del servidor (necesita PostgreSQL andando)
npm run prueba:movil    #  46 de la aplicación móvil
npm run prueba:panel    #  22 del panel
```

Las del servidor tardan unos cinco minutos: cada archivo crea su propia base
desde cero y la siembra entera. Crean y destruyen `servitotal_pruebas`;
**nunca tocan su base de desarrollo**.

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
| La app móvil no conecta | `EXPO_PUBLIC_API` apunta a `localhost`: desde el teléfono eso es el teléfono. Use la IP de su computadora |
| `Cannot find module '@servitotal/compartido'` | Faltó `npm install` en la raíz, o se instaló dentro de un subproyecto. Se arregla con `npm run construir` |

Para empezar de cero sin reinstalar nada:

```bash
npm run sembrar    # vacía y regenera los datos
```

---

## Las cuatro piezas, de un vistazo

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
            │  App móvil      │   ← tableta del técnico,
            │  (Expo)         │      trabaja sin red
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
  $env:EXPO_PUBLIC_API="http://192.168.1.50:3000/api/v1"; npm run iniciar --workspace movil
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
