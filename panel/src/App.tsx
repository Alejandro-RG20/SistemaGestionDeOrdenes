/**
 * Rutas del panel.
 *
 * `/consulta` queda FUERA de la sesion: es el portal del cliente y vive en
 * la misma aplicacion para no desplegar dos sitios por una sola pantalla.
 * Todo lo demas exige sesion.
 *
 * Ocultar una ruta no protege nada —el servidor comprueba el permiso en cada
 * peticion, que es la unica puerta que cuenta—, pero evita que alguien
 * navegue a una pantalla que solo le va a devolver 403.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorDeSesion, useSesion } from './sesion/contexto.js';
import { Armazon } from './componentes/Armazon.js';
import { Ingreso } from './pantallas/Ingreso.js';
import { Bandeja } from './pantallas/Bandeja.js';
import { Ordenes } from './pantallas/Ordenes.js';
import { DetalleOrden } from './pantallas/DetalleOrden.js';
import { Clientes } from './pantallas/Clientes.js';
import { Inventario, SolicitudesDeRepuesto } from './pantallas/Inventario.js';
import { Excepciones } from './pantallas/Excepciones.js';
import { Cobros, DetalleExpediente } from './pantallas/Cobros.js';
import { Indicadores } from './pantallas/Indicadores.js';
import { Administracion } from './pantallas/Administracion.js';
import { ConsultaPublica } from './pantallas/ConsultaPublica.js';

function Privado(): JSX.Element {
  const { usuario } = useSesion();
  if (usuario === null) return <Ingreso />;

  return (
    <Armazon>
      <Routes>
        <Route path="/" element={<Bandeja />} />
        <Route path="/ordenes" element={<Ordenes />} />
        <Route path="/ordenes/:id" element={<DetalleOrden />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/inventario/solicitudes" element={<SolicitudesDeRepuesto />} />
        <Route path="/excepciones" element={<Excepciones />} />
        <Route path="/excepciones/:id" element={<Excepciones />} />
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/cobros/:id" element={<DetalleExpediente />} />
        <Route path="/indicadores" element={<Indicadores />} />
        <Route path="/administracion" element={<Administracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Armazon>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ProveedorDeSesion>
        <Routes>
          <Route path="/consulta" element={<ConsultaPublica />} />
          <Route path="*" element={<Privado />} />
        </Routes>
      </ProveedorDeSesion>
    </BrowserRouter>
  );
}
