# 🐳 Docker + CI/CD con GitHub Actions + Render — ServiTotal

> Guía para hacerlo **a mano** sobre nuestro proyecto, siguiendo la misma estructura que la clase práctica
> [Pokemondemo · DOCKER-CICD.md](https://github.com/CristopherLarios/Pokemondemo/blob/DOCKERCICD/DOCKER-CICD.md).
> Proyecto: **ServiTotal** (API Node.js + Express, panel React + Vite, PostgreSQL 16).

```text
 Código ──push──▶ GitHub Actions ─────────────────────────────────────────────▶ Render
 (su PC)          1 tipos + pruebas ─▶ 2 build ─▶ smoke test ─▶ push GHCR ─▶ 3 deploy hook
                  (PostgreSQL de prueba)                        (registro)      (CD)
```

**Índice**

- [Parte 0 · Requisitos y preparación](#parte-0--requisitos-y-preparación)
- [Parte 1 · Dockerizar la app (crear los archivos)](#parte-1--dockerizar-la-app-crear-los-archivos)
- [Parte 2 · Construir, correr y comandos básicos](#parte-2--construir-correr-y-comandos-básicos)
- [Parte 3 · CI con GitHub Actions](#parte-3--ci-con-github-actions)
- [Parte 4 · Guardar la imagen en GitHub (GHCR)](#parte-4--guardar-la-imagen-en-github-ghcr)
- [Parte 5 · CD: base de datos y despliegue en Render](#parte-5--cd-base-de-datos-y-despliegue-en-render)
- [Parte 6 · Configuración manual del entorno (trace)](#parte-6--configuración-manual-del-entorno-trace)
- [Problemas frecuentes](#problemas-frecuentes)

---

## ¿Qué cambia respecto a Pokemondemo?

| Aspecto | Pokemondemo | ServiTotal |
|---|---|---|
| Tipo de app | Sitio estático (HTML, CSS, JS) | API Node.js + panel React + base de datos |
| Imagen base | `nginx:1.27-alpine` | `node:22-alpine`, en **dos etapas** |
| Compilar | No hace falta | TypeScript (compartido, servidor) y Vite (panel) |
| Base de datos | No tiene | PostgreSQL 16; las migraciones se aplican al arrancar |
| Prueba en CI | Un `curl` | Tipos + 125 pruebas del panel + 608 del servidor + smoke test de la imagen |
| En Render | 1 Web Service | 1 base **Postgres** + 1 Web Service |
| Datos iniciales | No | Hay que **sembrar** usuarios y datos una vez |

Por eso hay **más archivos** y **dos pasos extra** (la base y la siembra). Todo lo demás es igual que en la clase.

---

## Parte 0 · Requisitos y preparación

| Herramienta | Para qué | Verificar |
|---|---|---|
| Docker Desktop | Construir y correr imágenes | `docker --version` y `docker compose version` |
| Git | Control de versiones | `git --version` |
| Editor (VS Code) | Crear y editar los archivos | — |
| Cuenta GitHub | Repo + Actions + registro de imágenes | — |
| Cuenta Render | Hosting del contenedor y de la base | https://render.com |

> **Windows:** abran Docker Desktop antes de empezar (la ballena debe estar en verde). Usen **Git Bash** o PowerShell. Los comandos largos de esta guía están en **una sola línea** para que funcionen en ambos.

### 0.1 Subir el proyecto a su repositorio

1. GitHub → **+** → **New repository**. Nombre en minúsculas (ej. `servitotal`), **Public**, **sin** README ni .gitignore → **Create repository**.
2. En la carpeta del proyecto (la que tiene `compartido/`, `servidor/`, `panel/` y `base-datos/`):

```bash
git init                     # solo si la carpeta todavía no es un repositorio git
git add .
git commit -m "ServiTotal: código del proyecto"
git branch -M main
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

> Si `git remote add` dice que `origin` ya existe: `git remote set-url origin https://github.com/<usuario>/<repositorio>.git`

### 0.2 Comprobar que la estructura es la correcta

Esta guía supone esta estructura (es la de nuestro proyecto). Si algo no coincide, los archivos de Docker no la encontrarán:

```text
servitotal/
├── package.json  package-lock.json  tsconfig.base.json
├── compartido/   (package.json, tsconfig.json, src/)
├── servidor/     (package.json, tsconfig.json, src/aplicacion.ts, src/servidor.ts, src/comun/)
├── panel/        (package.json, index.html, vite.config.ts, src/)
└── base-datos/migraciones/   (0001_...sql … 0024_...sql)
```

> ⚠️ **No suban el archivo `.env`** (tiene contraseñas). Ya está en `.gitignore`; confirmen con `git status` que no aparece.

### 0.3 Crear la rama de trabajo

```bash
git checkout -b DOCKERCICD
```

---

## Parte 1 · Dockerizar la app (crear los archivos)

### 1.1 Conceptos clave

| Concepto | Analogía | Qué es |
|---|---|---|
| **Dockerfile** | Receta | Instrucciones para construir una imagen |
| **Imagen** | Pastel congelado | Paquete inmutable: Linux mínimo + Node.js + nuestro código compilado |
| **Contenedor** | Porción servida | Una imagen *en ejecución* |
| **Registro** | Supermercado | Donde se guardan imágenes (Docker Hub, GHCR) |
| **Tag** | Etiqueta de fecha | Versión de una imagen: `latest`, `1.0`, `sha-3896c7d` |
| **Multi-etapa** | Taller + vitrina | Se compila en una etapa y solo lo terminado pasa a la imagen final |
| **Variable de entorno** | Instrucciones pegadas en la caja | Configuración (base de datos, clave JWT, puerto) que se da al **correr**, no al construir |

### 1.2 Archivos que vamos a crear o modificar

```text
servitotal/
├── Dockerfile                          # NUEVO · receta de la imagen (2 etapas)
├── .dockerignore                       # NUEVO · qué NO copiar a la imagen
├── .gitattributes                      # NUEVO · scripts .sh con finales de línea de Linux
├── docker-compose.yml                  # NUEVO · app + PostgreSQL en su PC
├── docker/
│   └── arranque.sh                     # NUEVO · migraciones + arranque del servidor
├── .github/workflows/ci-cd.yml         # NUEVO · pipeline CI/CD (Parte 3)
└── servidor/src/
    ├── comun/panel-estatico.ts         # NUEVO · el servidor entrega el panel compilado
    └── aplicacion.ts                   # MODIFICAR · 3 cambios pequeños
```

Créenlos **en este orden**. Copien el contenido completo de cada bloque.

### 1.3 Paso 1 · `servidor/src/comun/panel-estatico.ts` (nuevo)

**¿Por qué?** En desarrollo el panel corre con Vite (puerto 5173) y la API con Express (puerto 3000): son **dos programas**. Dentro del contenedor hay **uno solo**: el panel se compila a archivos estáticos (`panel/dist`) y Express los entrega en el mismo dominio que la API. Así basta **un solo servicio** en Render y no hace falta CORS. Si `panel/dist` no existe (desarrollo y pruebas), no hace nada.

Creen el archivo `servidor/src/comun/panel-estatico.ts`:

```ts
/**
 * Servir el panel ya compilado desde el mismo proceso de la API.
 *
 * En desarrollo el panel corre con Vite (puerto 5173) y hace proxy de `/api`
 * hacia este servidor. En un contenedor no hay Vite: el panel se compila a
 * archivos estaticos (`panel/dist`) y los sirve Express, en el MISMO origen
 * que la API. Asi el navegador no cruza origenes, no hace falta CORS y la
 * aplicacion del tecnico (`/campo`) registra su service worker sin trucos.
 *
 * Solo se activa si la carpeta existe: las pruebas y el desarrollo, que no
 * compilan el panel, siguen exactamente igual que antes.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';

/** Donde buscar el panel compilado: `PANEL_DIST` o `panel/dist` del repositorio. */
export function carpetaDelPanel(): string {
  const configurada = process.env['PANEL_DIST'];
  if (configurada !== undefined && configurada !== '') return path.resolve(configurada);
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  // comun/ -> src|dist/ -> servidor/ -> raiz del repositorio
  return path.resolve(aqui, '..', '..', '..', 'panel', 'dist');
}

/**
 * Monta los archivos del panel y la ruta de respaldo de la SPA. Devuelve si
 * los monto. Se llama DESPUES de las rutas de la API: una ruta `/api/...`
 * desconocida sigue respondiendo el 404 en JSON de siempre, nunca el HTML.
 */
export function montarPanelEstatico(aplicacion: Express, carpeta = carpetaDelPanel()): boolean {
  const indice = path.join(carpeta, 'index.html');
  if (!existsSync(indice)) return false;

  aplicacion.use(express.static(carpeta, {
    index: false,
    setHeaders: (respuesta, ruta) => {
      // Vite pone una huella en el nombre de cada archivo de /assets: se
      // pueden guardar un año. El indice y el service worker, en cambio,
      // deben revisarse siempre o el navegador se queda con la version vieja.
      if (ruta.includes(`${path.sep}assets${path.sep}`)) {
        respuesta.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        respuesta.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // React Router resuelve las rutas en el navegador (/ordenes/123,
  // /campo, /consulta...). Cualquier GET que no sea de la API recibe el
  // indice y la SPA decide que pantalla mostrar.
  aplicacion.get(/^\/(?!api(?:\/|$)).*/, (_peticion, respuesta) => {
    respuesta.setHeader('Cache-Control', 'no-cache');
    respuesta.sendFile(indice);
  });
  return true;
}
```

### 1.4 Paso 2 · Modificar `servidor/src/aplicacion.ts`

Abran `servidor/src/aplicacion.ts` y hagan **tres cambios**:

**(a) Importar la función.** Debajo de la línea que importa `manejarErrores`, agreguen:

```ts
import { montarPanelEstatico } from './comun/panel-estatico.js';
```

**(b) Confiar en el proxy de Render.** Debajo de `aplicacion.disable('x-powered-by');` agreguen:

```ts
  /*
   * Detras de un proxy (Render), la IP del socket es la del proxy y no la del
   * cliente: el limite de peticiones del portal trataria a TODOS los clientes
   * como uno solo. TRUST_PROXY dice cuantos saltos de proxy creer.
   */
  const saltosDeProxy = Number.parseInt(process.env['TRUST_PROXY'] ?? '', 10);
  if (Number.isInteger(saltosDeProxy) && saltosDeProxy > 0) {
    aplicacion.set('trust proxy', saltosDeProxy);
  }
```

**(c) Montar el panel.** Justo **antes** de `aplicacion.use(manejarRutaDesconocida);` agreguen:

```ts
  // En el contenedor, el panel compilado se sirve desde aqui (mismo origen).
  montarPanelEstatico(aplicacion);
```

El final de la función debe quedar así:

```ts
  // En el contenedor, el panel compilado se sirve desde aqui (mismo origen).
  montarPanelEstatico(aplicacion);

  aplicacion.use(manejarRutaDesconocida);
  aplicacion.use(manejarErrores);

  return aplicacion;
}
```

**Comprobar** que compila (si tienen Node instalado):

```bash
npm install
npm run verificar-tipos
```

> El orden importa: el panel se monta **después** de la API, para que una ruta `/api/...` que no existe siga respondiendo JSON y no la página del panel.

### 1.5 Paso 3 · `Dockerfile` (nuevo, en la raíz)

```dockerfile
# syntax=docker/dockerfile:1
#
# Imagen de ServiTotal: API (Express) + panel web (React compilado) en un
# solo contenedor. El panel lo sirve el mismo servidor, en el mismo origen
# que la API, asi que no hace falta CORS ni un segundo servicio.
#
# Dos etapas:
#   1. construccion: instala TODO (TypeScript, Vite...), compila y al final
#      poda las dependencias de desarrollo.
#   2. produccion:   copia solo lo compilado y las dependencias de ejecucion.
# La imagen final no lleva compiladores, pruebas ni codigo TypeScript.

############################ 1. Construccion ############################
FROM node:22-alpine AS construccion
WORKDIR /app

# Primero lo que define las dependencias. Si no cambia, Docker reutiliza la
# capa de `npm ci` y no vuelve a descargar todo en cada build.
# `compartido` entra completo: su script "prepare" lo compila durante la
# instalacion y es un paquete pequeño que cambia poco.
COPY package.json package-lock.json tsconfig.base.json ./
COPY compartido/ compartido/
COPY servidor/package.json servidor/
COPY panel/package.json panel/
RUN npm ci

# Ahora el resto del codigo, y se compila.
COPY servidor/ servidor/
COPY panel/ panel/
RUN npm run construir --workspace compartido \
 && npm run construir --workspace servidor \
 && npm run construir --workspace panel

# Se quitan TypeScript, Vite, Vitest... de node_modules.
RUN npm prune --omit=dev

############################ 2. Produccion ##############################
FROM node:22-alpine AS produccion
ENV NODE_ENV=production \
    PORT=3000 \
    ALMACEN_OBJETOS_RAIZ=/app/datos/evidencias
WORKDIR /app

COPY --from=construccion /app/package.json /app/package-lock.json ./
COPY --from=construccion /app/node_modules node_modules
COPY --from=construccion /app/compartido/package.json compartido/package.json
COPY --from=construccion /app/compartido/dist compartido/dist
COPY --from=construccion /app/servidor/package.json servidor/package.json
COPY --from=construccion /app/servidor/dist servidor/dist
COPY --from=construccion /app/panel/package.json panel/package.json
COPY --from=construccion /app/panel/dist panel/dist
COPY base-datos/migraciones base-datos/migraciones
COPY docker/arranque.sh /usr/local/bin/arranque.sh

# No se corre como root. La carpeta de evidencias debe ser escribible.
# El `sed` quita los finales de linea de Windows (CRLF): si el script se
# edito en Windows, sin esto el contenedor no arranca ("not found").
RUN sed -i 's/\r$//' /usr/local/bin/arranque.sh \
 && chmod +x /usr/local/bin/arranque.sh \
 && mkdir -p /app/datos/evidencias \
 && chown -R node:node /app/datos
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/salud" || exit 1

# Aplica las migraciones pendientes y arranca el servidor.
CMD ["/usr/local/bin/arranque.sh"]
```

#### Explicado línea por línea

| Instrucción | Qué hace y por qué |
|---|---|
| `FROM node:22-alpine AS construccion` | Imagen base: Node 22 sobre Alpine (Linux mínimo). Versión **fija** = builds reproducibles. `AS construccion` nombra la etapa 1. |
| `WORKDIR /app` | Carpeta de trabajo dentro de la imagen. |
| `COPY package.json package-lock.json ...` | Primero solo lo que define las dependencias: si no cambia, Docker reutiliza la capa de `npm ci` desde la caché. |
| `COPY compartido/ compartido/` | Se copia completo porque su script `prepare` lo compila durante `npm ci`. |
| `RUN npm ci` | Instala las versiones **exactas** del `package-lock.json`. |
| `COPY servidor/ ...` y `COPY panel/ ...` | Ahora sí el resto del código. |
| `RUN npm run construir --workspace ...` | Compila compartido y servidor (TypeScript → JavaScript) y el panel (React → HTML/JS/CSS). |
| `RUN npm prune --omit=dev` | Quita TypeScript, Vite, Vitest: no se necesitan para **correr**. |
| `FROM node:22-alpine AS produccion` | Etapa 2: imagen limpia. Solo recibe lo que se copia con `COPY --from=construccion`. |
| `ENV PORT=3000 ...` | Valores por defecto. Render cambia `PORT` a 10000 y el servidor lo respeta. |
| `COPY --from=construccion ...` | Trae lo compilado, `node_modules` ya podado y las migraciones SQL. |
| `RUN sed ... && chmod +x ...` | Quita finales de línea de Windows del script y lo hace ejecutable. |
| `USER node` | El proceso **no** corre como administrador (root). |
| `EXPOSE 3000` | Documentación: el puerto en el que escucha. No publica nada solo (eso lo hace `-p`). |
| `HEALTHCHECK` | Cada 30 s Docker consulta `/api/v1/salud` y marca el contenedor `healthy` o `unhealthy`. |
| `CMD [...]` | Lo que se ejecuta al encender: el script de arranque. |

> ⚠️ Igual que en la clase: nunca `FROM node:latest`. "latest" cambia sin avisar.

### 1.6 Paso 4 · `docker/arranque.sh` (nuevo)

Creen la carpeta `docker/` y dentro el archivo `arranque.sh`:

```sh
#!/bin/sh
# Arranque del contenedor de ServiTotal.
#
# 1. Aplica las migraciones pendientes. Es seguro repetirlo: las ya
#    aplicadas se omiten (y si alguien altero una, se detiene con error en
#    vez de arrancar sobre una base inconsistente).
# 2. Arranca el servidor HTTP con `exec`, para que reciba SIGTERM
#    directamente y cierre ordenadamente cuando la plataforma lo detenga.
#
# Con MIGRAR_AL_INICIAR=no se omite el paso 1.
set -e

if [ "${MIGRAR_AL_INICIAR:-si}" = "si" ]; then
  echo "Aplicando migraciones..."
  node servidor/dist/infraestructura/migraciones/cli.js aplicar
fi

exec node servidor/dist/servidor.js
```

Al encender el contenedor: **1)** aplica las migraciones que falten (crea o actualiza las tablas) y **2)** arranca el servidor. Las migraciones ya aplicadas se saltan, así que reiniciar es seguro.

> En VS Code, abajo a la derecha, cambien `CRLF` por **`LF`** al guardar este archivo. Si se les olvida, el `sed` del Dockerfile lo corrige igual.

### 1.7 Paso 5 · `.dockerignore` (nuevo)

```text
# Lo que NO entra al "docker build": imagen mas chica, build mas rapido y
# ningun secreto copiado por accidente.
.git
.github
**/node_modules
**/dist
**/*.tsbuildinfo
.env
.env.*
!.env.ejemplo
datos
documentos
*.md
docker-compose.yml
coverage
*.log
```

Igual que `.gitignore` pero para `docker build`: imagen más pequeña, build más rápido y **ningún `.env` con contraseñas copiado por accidente**.

### 1.8 Paso 6 · `.gitattributes` (nuevo)

```text
# Los scripts de shell siempre con finales de linea de Linux (LF).
*.sh text eol=lf
```

Hace que Git guarde los `.sh` con finales de línea de Linux aunque los editen en Windows.

### 1.9 Paso 7 · `docker-compose.yml` (nuevo)

En Pokemondemo bastaba `docker run`. ServiTotal necesita **una base de datos al lado**: Compose levanta los dos contenedores juntos.

```yaml
# ServiTotal completo en su PC con un solo comando:  docker compose up --build
#
#   bd   -> PostgreSQL 16 con sus datos en un volumen (sobreviven a reinicios)
#   app  -> la imagen de ServiTotal (aplica migraciones y arranca)
#
# Panel: http://localhost:8080      Salud de la API: http://localhost:8080/api/v1/salud
#
# Datos de demostracion (SOLO la primera vez, BORRA lo que haya en la base):
#   docker compose run --rm app node servidor/dist/infraestructura/semillas/cli.js
services:
  bd:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: servitotal
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - datos-bd:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d servitotal"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    build: .
    image: servitotal:local
    depends_on:
      bd:
        condition: service_healthy
    environment:
      PORT: 3000
      DATABASE_HOST: bd          # el nombre del servicio es el host dentro de la red de compose
      DATABASE_PORT: 5432
      DATABASE_NAME: servitotal
      DATABASE_USER: postgres
      DATABASE_PASSWORD: postgres
      JWT_SECRET: clave-local-de-desarrollo-cambiela-en-produccion-123456
    ports:
      - "8080:3000"
    volumes:
      - evidencias:/app/datos/evidencias

volumes:
  datos-bd:
  evidencias:
```

| Parte | Qué hace |
|---|---|
| `bd` | PostgreSQL 16. Sus datos viven en el volumen `datos-bd`: sobreviven a reinicios. |
| `healthcheck` de `bd` | `app` espera a que la base esté lista (`condition: service_healthy`). |
| `app` → `build: .` | Construye la imagen con el Dockerfile de la raíz. |
| `DATABASE_HOST: bd` | Dentro de Compose, el **nombre del servicio** es el host. |
| `ports: "8080:3000"` | Puerto 8080 de su PC → 3000 del contenedor. |

### 1.10 Guardar el avance

```bash
git add .
git commit -m "feat: docker (Dockerfile, compose, arranque, panel estatico)"
```

---

## Parte 2 · Construir, correr y comandos básicos

### 2.1 Levantar todo con Compose ✅

```bash
# Construir la imagen y levantar app + base (la primera vez tarda unos minutos)
docker compose up --build -d

# Ver el arranque: deben salir "Migraciones al dia" y "ServiTotal escuchando en el puerto 3000"
docker compose logs -f app
```

(Para salir de los logs: `Ctrl + C`; los contenedores siguen corriendo.)

Comprobar:
- 👉 http://localhost:8080/api/v1/salud → `{"datos":{"estado":"disponible"}}`
- 👉 http://localhost:8080 → pantalla de inicio de sesión

### 2.2 Sembrar los datos de demostración (solo la primera vez)

La base está vacía: no hay usuarios. La siembra crea 37 usuarios, catálogos y 30 000 órdenes (~3 minutos):

```bash
docker compose run --rm app node servidor/dist/infraestructura/semillas/cli.js
```

Termina con `Siembra completa`. Entren en http://localhost:8080 con:

| Usuario | Rol | Contraseña |
|---|---|---|
| `nhernandez` | Jefa de atención al cliente | `ServiTotal.2026` |
| `abermudez` | Administrador | `ServiTotal.2026` |

> 🛑 **La siembra BORRA todo lo que haya en la base** antes de cargar los datos de demostración. Úsenla solo en una base nueva.

### 2.3 Detener y limpiar

```bash
docker compose down        # detiene; los datos quedan en el volumen
docker compose down -v     # detiene y BORRA los datos (volúmenes)
```

### 2.4 Comandos de imágenes

| Comando | Qué hace |
|---|---|
| `docker build -t servitotal:1.0 .` | Construye la imagen desde el Dockerfile |
| `docker images` | Lista imágenes locales |
| `docker history servitotal:1.0` | Capas de la imagen |
| `docker inspect servitotal:1.0` | Metadatos completos (JSON) |
| `docker rmi servitotal:1.0` | Borra una imagen |
| `docker image prune` | Borra imágenes huérfanas (`<none>`) |

### 2.5 Comandos de contenedores

| Comando | Qué hace |
|---|---|
| `docker compose ps` / `docker ps -a` | Contenedores corriendo / todos |
| `docker compose logs -f app` | Logs en vivo |
| `docker compose exec app sh` | Terminal dentro del contenedor (`exit` para salir) |
| `docker inspect --format "{{.State.Health.Status}}" <contenedor>` | Resultado del HEALTHCHECK |
| `docker compose restart app` | Reiniciar solo la app |
| `docker system prune` | Limpieza general |

### 2.6 Versiones (tags) y rollback

```bash
docker build -t servitotal:1.0 .
# ...cambian el título en panel/index.html...
docker build -t servitotal:1.1 .
docker tag servitotal:1.1 servitotal:latest     # misma imagen, otra etiqueta
docker images servitotal                        # 1.1 y latest tienen el mismo IMAGE ID
```

Correr una versión concreta contra la base de Compose:

```bash
docker compose up -d bd
docker run -d --name st10 --network servitotal_default -p 8081:3000 -e DATABASE_HOST=bd -e DATABASE_NAME=servitotal -e DATABASE_USER=postgres -e DATABASE_PASSWORD=postgres -e JWT_SECRET=una-clave-local-de-al-menos-32-caracteres-123 servitotal:1.0
```

> `servitotal_default` es la red que crea Compose: `<nombre-de-la-carpeta>_default`. Véanla con `docker network ls`.

### 2.7 Ejercicio de clase 🧪

1. Construyan `servitotal:1.0` y levántenlo con Compose (puerto 8080).
2. Cambien el `<title>` de `panel/index.html`, construyan `servitotal:1.1` y córranlo en el 8081 con el comando de 2.6, cambiando `servitotal:1.0` por `servitotal:1.1`.
3. Comparen las dos versiones en el navegador.
4. Limpien: `docker rm -f st10` y `docker rmi servitotal:1.0 servitotal:1.1`.

---

## Parte 3 · CI con GitHub Actions

### 3.1 ¿Qué es?

| Término | Significado |
|---|---|
| **Workflow** | El archivo `.yml` completo |
| **`on`** | Qué lo dispara (push, PR, manual) |
| **Job** | Grupo de pasos en una máquina virtual |
| **Step** | Un comando (`run`) o una acción reutilizable (`uses`) |
| **Service** | Un contenedor auxiliar del job; aquí, PostgreSQL para las pruebas |
| **`needs`** | "Este job solo corre si el otro terminó bien" |
| **Secret** | Valor privado guardado en GitHub |

### 3.2 Crear `.github/workflows/ci-cd.yml`

Creen las carpetas `.github/workflows/` (con el punto) y dentro `ci-cd.yml`:

```yaml
# CI/CD de ServiTotal:  pruebas -> imagen Docker -> GHCR -> Render
#
#  push ──▶ Job 1 pruebas ──▶ Job 2 imagen (build + smoke test + push GHCR) ──▶ Job 3 deploy Render
#
# Un pull request hacia main corre los jobs 1 y 2 SIN publicar ni desplegar.
name: CI/CD Docker -> GHCR -> Render

on:
  push:
    branches: [main, DOCKERCICD]
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}   # usuario/repo -> ghcr.io/usuario/repo (en minusculas)
  NODE_VERSION: '22'

jobs:
  # ───────────────────────── Job 1: calidad del codigo ─────────────────────────
  pruebas:
    name: 1 · Tipos y pruebas
    runs-on: ubuntu-latest
    timeout-minutes: 40
    # PostgreSQL de verdad para las pruebas de integracion del servidor.
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 20
    env:
      BD_HOST: 127.0.0.1
      BD_PUERTO: '5432'
      BD_USUARIO: postgres
      BD_CONTRASENA: postgres
      # Solo para las pruebas: no es la clave de produccion (esa va en Render).
      JWT_SECRETO: clave-exclusiva-de-las-pruebas-de-ci-1234567890
    steps:
      - name: 1. Descargar el codigo
        uses: actions/checkout@v4

      - name: 2. Instalar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - name: 3. Instalar dependencias (exactas, segun package-lock.json)
        run: npm ci

      - name: 4. Verificar tipos (compartido, servidor y panel)
        run: npm run verificar-tipos

      - name: 5. Pruebas del panel
        run: npm run prueba:panel

      - name: 6. Pruebas del servidor (unidad + integracion con PostgreSQL)
        run: npm run prueba

  # ─────────────────── Job 2: imagen Docker probada y publicada ──────────────────
  imagen:
    name: 2 · Imagen Docker (build, smoke test, GHCR)
    needs: pruebas
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      packages: write          # para subir la imagen a GHCR
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: servitotal
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 20
    steps:
      - name: 1. Descargar el codigo
        uses: actions/checkout@v4

      - name: 2. Construir la imagen
        run: docker build -t servitotal:test .

      - name: 3. Smoke test (migraciones + API + panel)
        run: |
          docker run -d --name app --network host \
            -e PORT=3000 \
            -e DATABASE_HOST=127.0.0.1 -e DATABASE_NAME=servitotal \
            -e DATABASE_USER=postgres -e DATABASE_PASSWORD=postgres \
            -e JWT_SECRET=clave-exclusiva-del-smoke-test-1234567890 \
            servitotal:test
          # Esperar hasta 60 s a que aplique las migraciones y escuche.
          for i in $(seq 1 60); do
            curl -sf http://localhost:3000/api/v1/salud && break
            sleep 1
          done
          curl -sf http://localhost:3000/api/v1/salud | grep -q '"disponible"'
          curl -sf http://localhost:3000/ | grep -q 'ServiTotal'
          curl -sf http://localhost:3000/ordenes | grep -q 'ServiTotal'
          echo "✅ La API responde, las migraciones se aplicaron y el panel se sirve"

      - name: 4. Logs del contenedor (solo si fallo)
        if: failure()
        run: docker logs app

      - name: 5. Login en GitHub Container Registry
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 6. Calcular tags (latest + sha)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest
            type=sha

      - name: 7. Publicar en GHCR la MISMA imagen que paso el smoke test
        if: github.event_name != 'pull_request'
        run: |
          for tag in ${{ steps.meta.outputs.tags }}; do
            docker tag servitotal:test "$tag"
            docker push "$tag"
          done

  # ─────────────────────────── Job 3: despliegue (CD) ───────────────────────────
  deploy-render:
    name: 3 · Desplegar en Render
    needs: imagen
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Redesplegar el servicio (Render descarga la nueva imagen :latest)
        env:
          HOOK: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
        run: |
          if [ -z "$HOOK" ]; then
            echo "::error::Falta el secret RENDER_DEPLOY_HOOK_URL (Settings > Secrets and variables > Actions)."
            exit 1
          fi
          curl -sf -X POST "$HOOK" > /dev/null
          echo "✅ Render recibio la orden de redesplegar"
```

### 3.3 Explicado

**Cabecera**
- `on.push.branches: [main, DOCKERCICD]` → cada push a esas ramas.
- `on.pull_request.branches: [main]` → cada PR hacia main: **solo prueba**, no publica ni despliega.
- `workflow_dispatch` → botón **Run workflow** manual.
- `IMAGE_NAME: ${{ github.repository }}` → `usuario/repo`, igual que en la clase.

**Job 1 · `pruebas` (no existía en Pokemondemo)**
- `services.postgres` → GitHub levanta un PostgreSQL 16 de verdad para las pruebas de integración.
- `env` → credenciales **solo de prueba** (no son las de producción).
- Pasos: `checkout` → `setup-node` (Node 22 con caché de npm) → `npm ci` → `verificar-tipos` → pruebas del panel → pruebas del servidor (~5 min).

**Job 2 · `imagen`** (`needs: pruebas`)
1. **Construir:** `docker build -t servitotal:test .`, igual que en su PC.
2. **Smoke test:** enciende el contenedor contra un PostgreSQL vacío, espera hasta 60 s y verifica:
   - `/api/v1/salud` contiene `"disponible"` → la API vive y **las 24 migraciones se aplicaron**;
   - `/` contiene `ServiTotal` → el panel se sirve;
   - `/ordenes` contiene `ServiTotal` → las rutas de React funcionan.

   `curl -f` falla si el HTTP es 4xx/5xx; `grep -q` falla si no encuentra el texto. Si algo falla, **el pipeline se detiene y no se publica nada**.
3. **Logs si falló:** `if: failure()`.
4. **Login en GHCR:** con `GITHUB_TOKEN`, que GitHub crea solo. Nada que configurar.
5. **Tags:** `latest` + `sha-<commit>` (en minúsculas).
6. **Publicar:** a diferencia de la clase, **no se reconstruye**: se etiqueta y sube **la misma imagen que pasó el smoke test**. Lo que se probó es exactamente lo que se publica.

**Job 3 · `deploy-render`** (`needs: imagen`) → igual que en la clase: `curl -X POST` al Deploy Hook. Si falta el secret, avisa con un mensaje claro.

### 3.4 Subir y ver el pipeline

```bash
git add .
git commit -m "ci: pipeline docker + ghcr + render"
git push -u origin DOCKERCICD
```

GitHub → pestaña **Actions** → clic en la ejecución → clic en cada job → expandan cada step. ✅ verde = pasó, ❌ rojo = falló.

En esta primera ejecución:
- Job 1 ✅ (~6 min)
- Job 2 ✅ (~3 min)
- Job 3 ❌ → **es normal**: todavía no existe Render ni el secret (Parte 5).

**Demo para clase:** en el step 3 del job 2 cambien `grep -q 'ServiTotal'` por `grep -q 'Pokemon'`, hagan push y muestren que falla en el smoke test y **no** publica la imagen. Luego reviértanlo.

---

## Parte 4 · Guardar la imagen en GitHub (GHCR)

Cuando el job 2 termine en verde:

1. Su perfil de GitHub → **Packages** → paquete con el nombre del repo.
2. Deben ver los tags `latest` y `sha-xxxxxxx`.
3. **Háganlo público** (necesario para que Render lo descargue sin credenciales): **Package settings → Danger Zone → Change visibility → Public** → escriban el nombre para confirmar.
4. (Opcional) **Package settings → Manage Actions access**: el repo debe tener rol **Write**.

Probar desde cualquier PC:

```bash
docker pull ghcr.io/<usuario>/<repositorio>:latest
```

> El nombre en GHCR siempre va en **minúsculas**: si el repo se llama `PROYECTO_SERVITOTAL`, la imagen es `ghcr.io/<usuario>/proyecto_servitotal`.

---

## Parte 5 · CD: base de datos y despliegue en Render

**Diferencia clave con la clase:** primero se crea la **base de datos**, después el **servicio web**, y luego se **siembra** una vez.

### 5.1 Crear la base PostgreSQL (una sola vez)

1. https://dashboard.render.com → **+ New** → **Postgres**.
2. Llenen:
   - **Name:** `servitotal-bd`
   - **Database:** `servitotal`
   - **User:** `servitotal`
   - **Region:** la más cercana (ej. *Oregon*). **Anótenla: el servicio web debe ir en la misma.**
   - **PostgreSQL Version:** `16`
   - **Instance Type:** **Free**
3. **Create Database** y esperen a que diga **Available**.
4. En la página de la base, sección **Connections**, anoten (sin compartirlos):

| Dato | Ejemplo | Para qué |
|---|---|---|
| Hostname (interno) | `dpg-abc123-a` | Variable `DATABASE_HOST` del servicio web |
| Port | `5432` | `DATABASE_PORT` |
| Database | `servitotal` | `DATABASE_NAME` |
| Username | `servitotal` | `DATABASE_USER` |
| Password | `••••••` | `DATABASE_PASSWORD` |
| External Database URL | `postgresql://servitotal:...@dpg-abc123-a.oregon-postgres.render.com/servitotal` | La siembra desde su PC (5.3) |

### 5.2 Crear el servicio web (una sola vez)

1. **+ New** → **Web Service** → **Existing Image**.
2. **Image URL:** `ghcr.io/<usuario>/<repositorio>:latest` → **Connect**.
   > Si dice que no puede acceder: el paquete sigue privado (Parte 4, paso 3).
3. **Name:** `servitotal` (formará la URL) · **Region:** **la misma de la base** · **Instance Type:** **Free**.
4. **Environment Variables** → *Add Environment Variable*, una por una:

| Key | Value |
|---|---|
| `DATABASE_HOST` | Hostname **interno** (`dpg-abc123-a`) |
| `DATABASE_PORT` | `5432` |
| `DATABASE_NAME` | `servitotal` |
| `DATABASE_USER` | `servitotal` |
| `DATABASE_PASSWORD` | La contraseña de la base |
| `JWT_SECRET` | Botón **Generate** (o `openssl rand -base64 48`); mínimo 32 caracteres |
| `TRUST_PROXY` | `1` |

5. **Advanced** → **Health Check Path:** `/api/v1/salud`.
6. **Deploy Web Service**. En **Logs** deben aparecer:
   ```
   Migraciones al dia {"aplicadas":24,"omitidas":0}
   ServiTotal escuchando en el puerto 10000
   ```
   y luego *Your service is live 🎉*.

> `PORT` no hace falta: Render inyecta `PORT=10000` y el servidor lo usa.
> ℹ️ Plan Free: el servicio "se duerme" tras ~15 min sin visitas; la primera visita tarda ~30–50 s.

### 5.3 Sembrar los datos en Render (una sola vez)

El plan gratuito no tiene consola, así que se siembra **desde su PC** usando la misma imagen y la dirección **externa** de la base, con SSL. Del *External Database URL* tomen el **host**, que es lo que está entre `@` y `/`: `dpg-abc123-a.oregon-postgres.render.com`.

```bash
docker run --rm -e DATABASE_HOST=<host-externo> -e DATABASE_PORT=5432 -e DATABASE_NAME=servitotal -e DATABASE_USER=servitotal -e DATABASE_PASSWORD=<contraseña> -e PGSSLMODE=require ghcr.io/<usuario>/<repositorio>:latest node servidor/dist/infraestructura/semillas/cli.js
```

- `PGSSLMODE=require` → conexión cifrada, que Render exige desde fuera.
- Termina con `Siembra completa`; por internet puede tardar varios minutos.

> 🛑 **Borra todo lo que haya en la base.** Ejecútenlo **una vez**, recién creada la base. Nunca con datos reales.

Abran `https://servitotal-xxxx.onrender.com` y entren con `nhernandez` / `ServiTotal.2026` 🎉

### 5.4 Conectar GitHub Actions con Render

Tras 5.2 Render desplegó **una vez**. En el próximo push, Actions sube otra imagen a GHCR, pero **Render no se entera**: el job `deploy-render` le avisa con el **Deploy Hook**.

| Secret | Dónde se obtiene |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → servicio → **Settings** → **Deploy Hook** → copiar la URL completa (`https://api.render.com/deploy/srv-...?key=...`) |

1. Copien la URL, **con** el `?key=...`.
2. GitHub → repo → **Settings** (del repo, no del perfil) → **Secrets and variables → Actions → New repository secret**.
3. Name `RENDER_DEPLOY_HOOK_URL` (exacto) · Secret = la URL → **Add secret**.
4. **Actions** → la ejecución con ❌ → **Re-run jobs → Re-run failed jobs**. `deploy-render` queda ✅ y en Render → **Events** aparece *Deploy triggered via Deploy Hook*.

> 🔐 La URL del hook **es** una contraseña. Nunca la pongan en el `.yml`. Si se filtra, en Render → **Regenerate** y actualicen el secret.

### 5.5 Prueba de punta a punta (CD)

1. Cambien un texto visible, por ejemplo el `<title>` en `panel/index.html`.
2. Hagan commit y push a `DOCKERCICD`.
3. Esperen a que Actions quede ✅ (~10 min) y Render diga *live* (~1–2 min más).
4. Recarguen la URL de Render (`Ctrl + Shift + R`): el cambio aparece **sin tocar Render**. Eso es CD.

### 5.6 Rollback en Render

- **Rápido:** Render → servicio → **Events** → deploy anterior → **Rollback**.
- **Por versión:** **Settings → Image URL** → `ghcr.io/<usuario>/<repositorio>:sha-<commit-bueno>` → **Save**. Vuelvan a `:latest` cuando corrijan, o los siguientes push no se verán.

### 5.7 Pasar a `main` (cuando todo funcione)

```bash
git checkout main
git merge DOCKERCICD
git push
```

O abran un **Pull Request** de `DOCKERCICD` hacia `main` en GitHub: el PR corre los jobs 1 y 2 sin publicar; al hacer merge se publica y despliega.

---

## Parte 6 · Configuración manual del entorno (trace)

Todo lo que **no** está automatizado, **en este orden**. El orden importa: el paquete en GHCR no existe hasta el primer push, Render no puede usarlo hasta que sea público y no se puede iniciar sesión hasta sembrar.

| # | Dónde | Acción | Resultado esperado |
|---|---|---|---|
| 1 | GitHub | Crear repo vacío y subir el proyecto a `main` (0.1) | Código visible en GitHub |
| 2 | Su PC | `git checkout -b DOCKERCICD` y crear los archivos de la Parte 1 | `git status` los muestra |
| 3 | Su PC | `docker compose up --build -d` + siembra (Parte 2) | Login en http://localhost:8080 |
| 4 | Su PC | Crear `ci-cd.yml` y `git push -u origin DOCKERCICD` | Arranca el workflow en **Actions** |
| 5 | Actions | Esperar los jobs 1 y 2 | ✅ ✅ · job 3 ❌ (**normal**) |
| 6 | Packages | Ver `latest` y `sha-xxxxxxx` → **Public** | Etiqueta *Public* |
| 7 | Render | **New → Postgres** (5.1) | *Available* |
| 8 | Render | **New → Web Service → Existing Image** + variables + health check (5.2) | *Your service is live* |
| 9 | Su PC | Sembrar con `docker run ... PGSSLMODE=require ...` (5.3) | `Siembra completa` |
| 10 | Navegador | Abrir la URL de Render e iniciar sesión | Panel principal con datos |
| 11 | Render | Copiar el Deploy Hook | URL con `?key=` |
| 12 | GitHub | Secret `RENDER_DEPLOY_HOOK_URL` | Secret listado |
| 13 | Actions | **Re-run failed jobs** | Job 3 ✅ |
| 14 | Su PC | Cambio visible → push (5.5) | Aparece en Render sin tocar nada |

### Registro de valores

Llénenlo durante la práctica. **Nunca** escriban aquí contraseñas ni la URL del hook.

```text
Repositorio ........: https://github.com/______________/______________
Imagen GHCR ........: ghcr.io/______________/______________
Visibilidad ........: Public  [ ]
Base Render ........: servitotal-bd    región: ______________
Servicio Render ....: ______________________
URL pública ........: https://______________________.onrender.com
Datos sembrados ....: [ ]
Secret creado ......: RENDER_DEPLOY_HOOK_URL [ ]
Primer deploy CD OK : fecha ____/____/______  commit sha-_______
```

### Checklist ✅

- [ ] `docker compose up --build` funciona y se puede iniciar sesión en local
- [ ] Practiqué tags, logs, exec, rollback y borrado de imágenes
- [ ] Push → Actions: jobs 1 y 2 en verde
- [ ] Imagen en **Packages** y marcada **Public**
- [ ] Base Postgres y Web Service creados en Render (misma región)
- [ ] Datos sembrados; login en la URL de Render
- [ ] Secret `RENDER_DEPLOY_HOOK_URL` creado; job 3 en verde
- [ ] Cambio → push → se ve en Render sin tocar nada más

---

## Problemas frecuentes

| Síntoma | Causa / Solución |
|---|---|
| `port is already allocated` | El 8080 está en uso: cambien a `"8081:3000"` en `docker-compose.yml` o `docker rm -f` el contenedor viejo |
| `Cannot connect to the Docker daemon` | Docker Desktop no está abierto |
| Build: `Cannot find module '@servitotal/compartido'` | Falta `compartido/` o su `tsconfig.json`; revisen la estructura (0.2) |
| Build: `npm ci` falla con *lockfile* | `package-lock.json` desactualizado: corran `npm install` en su PC, hagan commit y repitan |
| `exec /usr/local/bin/arranque.sh: no such file or directory` | El Dockerfile no tiene la línea `sed -i 's/\r$//'` (finales de línea de Windows) |
| `Falta la variable de entorno JWT_SECRET` | No definieron `JWT_SECRET`, o tiene menos de 32 caracteres |
| `ECONNREFUSED` / `ENOTFOUND` al arrancar | Host de base incorrecto: en Compose `bd`; en Render el **interno** y **misma región** |
| La app arranca y luego aparece `unhealthy` | Revisen `docker compose logs app`; casi siempre es la base o una variable |
| Siembra: `SSL/TLS required` o `no pg_hba.conf entry` | Falta `-e PGSSLMODE=require` (conexión externa a Render) |
| `permission denied to create extension` | El usuario no puede crear `uuid-ossp`/`pg_trgm`/`unaccent`. En Render y Compose sí puede |
| Login: *El usuario o la contraseña no son correctos* | La base no fue sembrada (2.2 en local, 5.3 en Render) |
| Job 1 falla en las pruebas | Abran el step: el error dice qué prueba y por qué. Corran `npm run prueba` en su PC |
| Job 2 falla en el smoke test | Miren el step **4. Logs del contenedor**: muestra por qué no arrancó |
| `denied: permission_denied` al subir a GHCR | Falta `packages: write` en el job, o el paquete pertenece a otro repo (*Manage Actions access*) |
| Render: *Unable to access image* / `failed to pull` | El paquete en GHCR sigue **privado** |
| Render: *No open ports detected* / *Timed out* | El contenedor no arrancó: miren **Logs** (variables o base) |
| Job deploy: `Falta el secret ...` o `curl: (22) 404` | `RENDER_DEPLOY_HOOK_URL` vacío, mal copiado (sin `?key=`) o regenerado |
| `invalid reference format: repository name must be lowercase` | Escriban la imagen en minúsculas |
| Render tarda en abrir | Plan Free dormido: la primera visita lo despierta (~30–50 s) |

### Limitaciones del plan gratuito

- La base Postgres gratuita de Render **vence a los 30 días** (revisen render.com/pricing): créenla pocos días antes de presentar.
- El disco del contenedor **no es persistente**: las fotos y firmas subidas se pierden en cada redespliegue. Los datos de la base no se pierden.
