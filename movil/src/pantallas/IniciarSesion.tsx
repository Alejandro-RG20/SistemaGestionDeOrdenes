/**
 * Inicio de sesion.
 *
 * Al entrar se descarga la jornada. Si la descarga falla por falta de senal
 * NO se bloquea la entrada: puede haber trabajo en la cola del dia anterior
 * esperando y el tecnico tiene que poder verlo y reintentarlo.
 */
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Coordinador } from '../app/coordinador.js';
import { COLOR, estilos } from './estilos.js';

export function IniciarSesion(
  { coordinador, alEntrar }: { coordinador: Coordinador; alEntrar: () => void },
): JSX.Element {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function entrar(): Promise<void> {
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      await coordinador.iniciarSesion(nombreUsuario.trim(), contrasena);
      try {
        await coordinador.descargarJornada();
      } catch {
        // Se entra igual: lo que quedo en la cola de ayer sigue ahi.
        setAviso('Entro, pero no se pudo bajar la jornada. Reintente cuando tenga senal.');
      }
      alEntrar();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setTrabajando(false);
    }
  }

  const listo = nombreUsuario.trim().length > 0 && contrasena.length > 0 && !trabajando;

  return (
    <View style={estilos.pantalla}>
      <Text style={estilos.titulo}>ServiTotal</Text>
      <Text style={estilos.subtitulo}>Taller Distrito VI · Managua</Text>

      {aviso === null ? null : (
        <View style={estilos.aviso}><Text style={estilos.avisoTexto}>{aviso}</Text></View>
      )}

      <Text style={estilos.etiqueta}>Usuario</Text>
      <TextInput
        style={estilos.campo}
        value={nombreUsuario}
        onChangeText={setNombreUsuario}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="jperez"
        placeholderTextColor={COLOR.textoTenue}
      />

      <Text style={estilos.etiqueta}>Contrasena</Text>
      <TextInput
        style={estilos.campo}
        value={contrasena}
        onChangeText={setContrasena}
        secureTextEntry
        placeholderTextColor={COLOR.textoTenue}
      />

      <TouchableOpacity
        style={[estilos.boton, listo ? null : estilos.botonInhabilitado]}
        disabled={!listo}
        onPress={entrar}
      >
        {trabajando
          ? <ActivityIndicator color="#082f49" />
          : <Text style={estilos.botonTexto}>Entrar</Text>}
      </TouchableOpacity>

      {error === null ? null : <Text style={estilos.error}>{error}</Text>}
    </View>
  );
}
