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
