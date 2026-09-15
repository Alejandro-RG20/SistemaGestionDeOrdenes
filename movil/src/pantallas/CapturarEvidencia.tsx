/**
 * Captura de evidencia.
 *
 * La foto se comprime ANTES de encolarse y su huella se calcula sobre el
 * archivo comprimido, que es el que va a viajar. Si se calculara sobre el
 * original, el servidor jamas podria verificarla y la carga se rechazaria
 * en un bucle.
 *
 * La ubicacion se adjunta si el dispositivo la da rapido y si no, no: en
 * una casa con techo de zinc el GPS puede tardar un minuto, y detener al
 * tecnico por una coordenada seria cambiar algo util por algo accesorio.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Image, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { ReglaEvidenciaDeJornada } from '@servitotal/compartido';
import type { Coordinador } from '../app/coordinador.js';
import { prepararEvidencia } from '../sincronizacion/captura-evidencia.js';
import { COLOR, estilos } from './estilos.js';

/** Cuanto se espera por el GPS antes de seguir sin el. */
const ESPERA_UBICACION_MS = 4000;

async function ubicacionSiLlegaRapido(): Promise<{ latitud: number; longitud: number } | null> {
  try {
    const permiso = await Location.getForegroundPermissionsAsync();
    if (!permiso.granted) return null;
    const posicion = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolver) => setTimeout(() => resolver(null), ESPERA_UBICACION_MS)),
    ]);
    if (posicion === null) return null;
    return { latitud: posicion.coords.latitude, longitud: posicion.coords.longitude };
  } catch {
    return null;
  }
}

export function CapturarEvidencia(
  { coordinador, idOrden, alVolver }:
  { coordinador: Coordinador; idOrden: string; alVolver: () => void },
): JSX.Element {
  const [reglas, setReglas] = useState<ReglaEvidenciaDeJornada[]>([]);
  const [clave, setClave] = useState<ReglaEvidenciaDeJornada | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const orden = await coordinador.orden(idOrden);
      if (orden !== null) setReglas(await coordinador.evidenciaRequerida(orden));
    })();
  }, [coordinador, idOrden]);

  async function tomar(regla: ReglaEvidenciaDeJornada): Promise<void> {
    setError(null);
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      setError('La aplicacion necesita la camara para tomar la evidencia.');
      return;
    }

    const captura = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
    if (captura.canceled || captura.assets[0] === undefined) return;

    setTrabajando(true);
    try {
      // Comprime, mide y calcula la huella sobre el archivo que va a viajar.
      const preparada = await prepararEvidencia(captura.assets[0].uri, regla.tipoArchivo);
      const ubicacion = await ubicacionSiLlegaRapido();

      await coordinador.registrarEvidencia({
        idOrden,
        clave: regla.clave,
        tipo: regla.tipoArchivo,
        rutaLocal: preparada.rutaLocal,
        bytes: preparada.bytes,
        huellaDigital: preparada.huellaDigital,
        latitud: ubicacion?.latitud ?? null,
        longitud: ubicacion?.longitud ?? null,
      });

      setVistaPrevia(preparada.rutaLocal);
      setClave(regla);
      Alert.alert(
        'Evidencia guardada',
        'Queda en este dispositivo y sube por su cuenta cuando haya senal. ' +
        'No borre nada de la tableta hasta que la bandeja diga que esta al dia.',
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <ScrollView style={estilos.pantalla}>
      <TouchableOpacity onPress={alVolver} style={{ paddingVertical: 8 }}>
        <Text style={{ color: COLOR.acento, fontSize: 16 }}>‹ Volver a la orden</Text>
      </TouchableOpacity>

      <Text style={estilos.titulo}>Evidencia</Text>
      <Text style={estilos.subtitulo}>
        Lo que esta garantia exige. Se comprime aqui mismo para que suba con mala senal.
      </Text>

      {reglas.length === 0 ? (
        <Text style={estilos.vacio}>
          Esta garantia no tiene evidencia obligatoria registrada. Puede tomar fotos igual
          desde el panel del taller.
        </Text>
      ) : null}

      {reglas.map((regla) => (
        <TouchableOpacity
          key={`${regla.clave}-${regla.momento}`}
          style={[estilos.tarjeta, trabajando ? estilos.botonInhabilitado : null]}
          disabled={trabajando}
          onPress={() => void tomar(regla)}
        >
          <View style={estilos.fila}>
            <Text style={estilos.texto}>{regla.etiqueta}</Text>
            <Text style={estilos.insignia}>{regla.tipoArchivo}</Text>
          </View>
          <Text style={estilos.textoTenue}>Momento: {regla.momento.replace(/_/g, ' ')}</Text>
        </TouchableOpacity>
      ))}

      {vistaPrevia === null ? null : (
        <View style={estilos.tarjeta}>
          <Text style={estilos.textoTenue}>Ultima capturada: {clave?.etiqueta}</Text>
          <Image
            source={{ uri: vistaPrevia }}
            style={{ width: '100%', height: 220, borderRadius: 8, marginTop: 8 }}
            resizeMode="cover"
          />
        </View>
      )}

      {error === null ? null : <Text style={estilos.error}>{error}</Text>}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
