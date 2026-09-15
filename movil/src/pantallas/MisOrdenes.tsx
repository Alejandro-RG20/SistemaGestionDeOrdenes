/**
 * Las ordenes del tecnico, tal como estan en el espejo local.
 *
 * Esta pantalla NO consulta al servidor. Se dibuja siempre, con senal o
 * sin ella, porque es la lista de trabajo del dia: si dependiera de la red
 * seria inutil justo donde el pliego dice que se trabaja, en casas sin
 * cobertura.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { ESTADO_ORDEN } from '@servitotal/compartido';
import type { Coordinador } from '../app/coordinador.js';
import type { OrdenEnEspejo } from '../datos/espejo.js';
import { COLOR, estilos } from './estilos.js';

/** Cuanto falta para el plazo, dicho en palabras. */
function plazoEnPalabras(plazoVenceEn: string | null): { texto: string; color: string } {
  if (plazoVenceEn === null) return { texto: 'Sin plazo', color: COLOR.textoTenue };
  const horas = (new Date(plazoVenceEn).getTime() - Date.now()) / 3_600_000;
  if (horas < 0) return { texto: `Vencida hace ${Math.round(-horas)} h`, color: COLOR.peligro };
  if (horas < 8) return { texto: `Vence en ${Math.round(horas)} h`, color: COLOR.alerta };
  return { texto: `Vence en ${Math.round(horas / 24)} d`, color: COLOR.textoTenue };
}

export function MisOrdenes({ coordinador, alAbrir, alIrABandeja }: {
  coordinador: Coordinador;
  alAbrir: (idOrden: string) => void;
  alIrABandeja: () => void;
}): JSX.Element {
  const [ordenes, setOrdenes] = useState<OrdenEnEspejo[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [refrescando, setRefrescando] = useState(false);

  const recargar = useCallback(async () => {
    setOrdenes(await coordinador.misOrdenes());
    const estado = await coordinador.estado();
    setPendientes(estado.operacionesPendientes + estado.evidenciasPendientes);
  }, [coordinador]);

  useEffect(() => { void recargar(); }, [recargar]);

  async function bajarParaRefrescar(): Promise<void> {
    setRefrescando(true);
    try {
      await coordinador.sincronizarYDescargar();
    } catch {
      // Sin senal no es un error que interrumpa: la lista local sigue sirviendo.
    } finally {
      await recargar();
      setRefrescando(false);
    }
  }

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.fila}>
        <Text style={estilos.titulo}>Mis ordenes</Text>
        <TouchableOpacity onPress={alIrABandeja} style={{ padding: 8 }}>
          <Text style={[estilos.insignia, pendientes > 0
            ? { backgroundColor: COLOR.alerta }
            : { backgroundColor: COLOR.exito }]}
          >
            {pendientes > 0 ? `${pendientes} sin subir` : 'todo al dia'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={estilos.subtitulo}>
        Deslice hacia abajo para subir lo pendiente y bajar la jornada.
      </Text>

      <FlatList
        data={ordenes}
        keyExtractor={(orden) => orden.id}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={bajarParaRefrescar} tintColor={COLOR.acento} />
        }
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            No hay ordenes asignadas. Deslice hacia abajo para bajar la jornada.
          </Text>
        }
        renderItem={({ item }) => {
          const plazo = plazoEnPalabras(item.plazoVenceEn);
          const urgente = item.plazoVenceEn !== null
            && new Date(item.plazoVenceEn).getTime() < Date.now();
          return (
            <TouchableOpacity
              style={[estilos.tarjeta, urgente ? estilos.tarjetaVencida : null]}
              onPress={() => alAbrir(item.id)}
            >
              <View style={estilos.fila}>
                <Text style={estilos.numero}>Orden {item.numero}</Text>
                <Text style={estilos.insignia}>{item.estado.replace(/_/g, ' ')}</Text>
              </View>
              <Text style={estilos.texto}>{item.cliente}</Text>
              <Text style={estilos.textoTenue}>{item.articulo}</Text>
              <Text style={estilos.textoTenue} numberOfLines={2}>{item.fallaReportada}</Text>
              <View style={[estilos.fila, { marginTop: 8 }]}>
                <Text style={estilos.textoTenue}>
                  {item.modalidad === 'ruta' ? (item.zona ?? 'Ruta') : 'Taller'}
                </Text>
                <Text style={[estilos.textoTenue, { color: plazo.color }]}>{plazo.texto}</Text>
              </View>
              {item.estado === ESTADO_ORDEN.EN_RUTA && item.direccionServicio !== null
                ? <Text style={[estilos.textoTenue, { marginTop: 6 }]}>{item.direccionServicio}</Text>
                : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
