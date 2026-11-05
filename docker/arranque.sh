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
