/**
 * Consumo de repuesto en campo.
 *
 * El precio se muestra y se manda: es el que el tecnico le dijo al cliente.
 * Si para cuando la operacion llega al servidor el catalogo cambio, el
 * servidor respeta el firmado y anota la diferencia. Eso ya esta resuelto
 * alla; aqui solo hay que asegurarse de MANDARLO.
 *
 * Tambien se puede descargar un repuesto que la bodega movil no registraba.
 * Pasa —se lo presto un companero, lo trae de otra orden— y negarlo no lo
 * evita: solo hace que no quede anotado.
 */
import { useEffect, useState } from 'react';
import { Alert, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Coordinador } from '../app/coordinador.js';
import type { RepuestoConExistencia } from '../datos/espejo.js';
import { COLOR, estilos } from './estilos.js';

export function ConsumirRepuesto(
  { coordinador, idOrden, alVolver }:
  { coordinador: Coordinador; idOrden: string; alVolver: () => void },
): JSX.Element {
  const [repuestos, setRepuestos] = useState<RepuestoConExistencia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<RepuestoConExistencia | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => setRepuestos(await coordinador.repuestos()))();
  }, [coordinador]);

  const filtro = busqueda.trim().toLowerCase();
  const visibles = filtro === ''
    ? repuestos.slice(0, 40)
    : repuestos.filter((repuesto) =>
      repuesto.codigo.toLowerCase().includes(filtro)
      || repuesto.descripcion.toLowerCase().includes(filtro)).slice(0, 40);

  async function confirmar(): Promise<void> {
    if (elegido === null) return;
    const unidades = Number.parseInt(cantidad, 10);
    if (!Number.isFinite(unidades) || unidades <= 0) {
      setError('La cantidad tiene que ser un numero entero mayor que cero.');
      return;
    }
    try {
      await coordinador.consumirRepuesto(idOrden, elegido.id, unidades, elegido.precio);
      Alert.alert(
        'Registrado',
        unidades > elegido.cantidad
          ? 'Se anoto. Descargo mas de lo que su bodega tenia registrado; el taller lo ' +
            'va a conciliar cuando suba.'
          : 'El consumo quedo en la cola de este dispositivo.',
      );
      alVolver();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    }
  }

  if (elegido !== null) {
    const unidades = Number.parseInt(cantidad, 10);
    const excede = Number.isFinite(unidades) && unidades > elegido.cantidad;
    return (
      <View style={estilos.pantalla}>
        <TouchableOpacity onPress={() => setElegido(null)} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLOR.acento, fontSize: 16 }}>‹ Elegir otro repuesto</Text>
        </TouchableOpacity>

        <Text style={estilos.titulo}>{elegido.codigo}</Text>
        <Text style={estilos.subtitulo}>{elegido.descripcion}</Text>

        <View style={estilos.tarjeta}>
          <View style={estilos.fila}>
            <Text style={estilos.textoTenue}>En su bodega</Text>
            <Text style={estilos.texto}>{elegido.cantidad}</Text>
          </View>
          <View style={[estilos.fila, { marginTop: 8 }]}>
            <Text style={estilos.textoTenue}>Precio que se le cobra al cliente</Text>
            <Text style={estilos.texto}>C$ {elegido.precio.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={estilos.etiqueta}>Cantidad</Text>
        <TextInput
          style={estilos.campo}
          value={cantidad}
          onChangeText={setCantidad}
          keyboardType="number-pad"
        />

        {excede ? (
          <View style={[estilos.aviso, { marginTop: 12 }]}>
            <Text style={estilos.avisoTexto}>
              Su bodega tiene {elegido.cantidad}. Se puede registrar igual: el taller lo
              concilia y queda anotado quien lo puso.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={estilos.boton} onPress={confirmar}>
          <Text style={estilos.botonTexto}>Registrar consumo</Text>
        </TouchableOpacity>

        {error === null ? null : <Text style={estilos.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={estilos.pantalla}>
      <TouchableOpacity onPress={alVolver} style={{ paddingVertical: 8 }}>
        <Text style={{ color: COLOR.acento, fontSize: 16 }}>‹ Volver a la orden</Text>
      </TouchableOpacity>

      <Text style={estilos.titulo}>Repuesto usado</Text>
      <TextInput
        style={estilos.campo}
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Codigo o descripcion"
        placeholderTextColor={COLOR.textoTenue}
        autoCorrect={false}
      />

      <FlatList
        style={{ marginTop: 12 }}
        data={visibles}
        keyExtractor={(repuesto) => repuesto.id}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            No hay repuestos en la tableta. Baje la jornada antes de salir del taller.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={estilos.tarjeta} onPress={() => setElegido(item)}>
            <View style={estilos.fila}>
              <Text style={estilos.numero}>{item.codigo}</Text>
              <Text style={[estilos.insignia, item.cantidad === 0
                ? { backgroundColor: COLOR.peligro }
                : null]}
              >
                {item.cantidad} en bodega
              </Text>
            </View>
            <Text style={estilos.texto}>{item.descripcion}</Text>
            <Text style={estilos.textoTenue}>C$ {item.precio.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
