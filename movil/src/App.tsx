/**
 * Aplicacion movil de ServiTotal.
 *
 * La navegacion es un `switch` sobre un estado, no una biblioteca de rutas.
 * Son siete pantallas y ninguna necesita enlaces profundos ni historial
 * persistente; meter un enrutador aqui seria pagar una dependencia mas —y
 * una actualizacion mas que romper— a cambio de nada.
 *
 * Al arrancar se intenta sincronizar una vez. Si no hay senal no pasa nada:
 * la cola queda como estaba y la app abre igual.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { armarAplicacion } from './app/armado.js';
import type { Coordinador } from './app/coordinador.js';
import { BandejaSincronizacion } from './pantallas/BandejaSincronizacion.js';
import { CapturarEvidencia } from './pantallas/CapturarEvidencia.js';
import { ConsumirRepuesto } from './pantallas/ConsumirRepuesto.js';
import { DetalleOrden } from './pantallas/DetalleOrden.js';
import { IniciarSesion } from './pantallas/IniciarSesion.js';
import { MisOrdenes } from './pantallas/MisOrdenes.js';
import { RegistrarDiagnostico } from './pantallas/RegistrarDiagnostico.js';
import { COLOR, estilos } from './pantallas/estilos.js';

/**
 * Raiz de la API, con la version incluida: el servidor sirve todo bajo
 * `/api/v1` y sin el `/v1` cada peticion cae en un 404.
 *
 * El valor por defecto es el del emulador de Android, donde 10.0.2.2 es la
 * maquina que lo hospeda. En una tableta de verdad hay que apuntar a la IP
 * del servidor en la red del centro, con EXPO_PUBLIC_API.
 */
const RAIZ_API = process.env['EXPO_PUBLIC_API'] ?? 'http://10.0.2.2:3000/api/v1';

type Vista =
  | { nombre: 'cargando' }
  | { nombre: 'sesion' }
  | { nombre: 'ordenes' }
  | { nombre: 'detalle'; idOrden: string }
  | { nombre: 'diagnostico'; idOrden: string }
  | { nombre: 'consumo'; idOrden: string }
  | { nombre: 'evidencia'; idOrden: string }
  | { nombre: 'bandeja' };

export default function App(): JSX.Element {
  const [coordinador, setCoordinador] = useState<Coordinador | null>(null);
  const [vista, setVista] = useState<Vista>({ nombre: 'cargando' });
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const armado = await armarAplicacion(RAIZ_API);
        setCoordinador(armado);
        const estado = await armado.estado();
        if (estado.usuario === null) {
          setVista({ nombre: 'sesion' });
          return;
        }
        // Hay sesion guardada: se intenta poner al dia y se entra igual si falla.
        try {
          await armado.sincronizarYDescargar();
        } catch { /* sin senal: la cola espera */ }
        setVista({ nombre: 'ordenes' });
      } catch (error) {
        setFallo(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  if (fallo !== null) {
    return (
      <View style={estilos.pantalla}>
        <StatusBar style="light" />
        <Text style={estilos.titulo}>No se pudo abrir la aplicacion</Text>
        <Text style={estilos.error}>{fallo}</Text>
        <Text style={[estilos.textoTenue, { marginTop: 16 }]}>
          Nada de lo que tenga guardado se ha perdido. Avise al taller antes de reinstalar.
        </Text>
      </View>
    );
  }

  if (coordinador === null || vista.nombre === 'cargando') {
    return (
      <View style={[estilos.pantalla, { justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLOR.acento} size="large" />
      </View>
    );
  }

  const enlace = coordinador;

  return (
    <View style={{ flex: 1, backgroundColor: COLOR.fondo }}>
      <StatusBar style="light" />
      {(() => {
        switch (vista.nombre) {
          case 'sesion':
            return (
              <IniciarSesion
                coordinador={enlace}
                alEntrar={() => setVista({ nombre: 'ordenes' })}
              />
            );
          case 'ordenes':
            return (
              <MisOrdenes
                coordinador={enlace}
                alAbrir={(idOrden) => setVista({ nombre: 'detalle', idOrden })}
                alIrABandeja={() => setVista({ nombre: 'bandeja' })}
              />
            );
          case 'detalle':
            return (
              <DetalleOrden
                coordinador={enlace}
                idOrden={vista.idOrden}
                acciones={{
                  alDiagnosticar: (idOrden) => setVista({ nombre: 'diagnostico', idOrden }),
                  alConsumir: (idOrden) => setVista({ nombre: 'consumo', idOrden }),
                  alCapturarEvidencia: (idOrden) => setVista({ nombre: 'evidencia', idOrden }),
                  alVolver: () => setVista({ nombre: 'ordenes' }),
                }}
              />
            );
          case 'diagnostico':
            return (
              <RegistrarDiagnostico
                coordinador={enlace}
                idOrden={vista.idOrden}
                alVolver={() => setVista({ nombre: 'detalle', idOrden: vista.idOrden })}
              />
            );
          case 'consumo':
            return (
              <ConsumirRepuesto
                coordinador={enlace}
                idOrden={vista.idOrden}
                alVolver={() => setVista({ nombre: 'detalle', idOrden: vista.idOrden })}
              />
            );
          case 'evidencia':
            return (
              <CapturarEvidencia
                coordinador={enlace}
                idOrden={vista.idOrden}
                alVolver={() => setVista({ nombre: 'detalle', idOrden: vista.idOrden })}
              />
            );
          case 'bandeja':
            return (
              <BandejaSincronizacion
                coordinador={enlace}
                alVolver={() => setVista({ nombre: 'ordenes' })}
                alSalir={() => setVista({ nombre: 'sesion' })}
              />
            );
        }
      })()}
    </View>
  );
}
