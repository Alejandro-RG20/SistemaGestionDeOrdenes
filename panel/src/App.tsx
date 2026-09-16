/**
 * Rutas del panel.
 *
 * Cada ruta lleva el codigo de pantalla del prototipo (W-02, W-03…) y su
 * miga de pan. No es decoracion: es lo que permite señalar una pantalla
 * concreta en la defensa del proyecto sin describirla.
 *
 * `/consulta` queda FUERA de la sesion: es el portal del cliente y vive en
 * la misma aplicacion para no desplegar dos sitios por una sola pantalla.
 *
 * Ocultar una ruta no protege nada —el servidor comprueba el permiso en
 * cada peticion, que es la unica puerta que cuenta— pero evita que alguien
 * navegue a una pantalla que solo le va a devolver 403.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorDeSesion, useSesion } from './sesion/contexto.js';
import { Armazon, type DatosDePantalla } from './componentes/Armazon.js';
import { Ingreso } from './pantallas/Ingreso.js';
import { PanelPrincipal } from './pantallas/PanelPrincipal.js';
import { Ordenes } from './pantallas/Ordenes.js';
import { NuevaOrden } from './pantallas/NuevaOrden.js';
import { DetalleOrden } from './pantallas/DetalleOrden.js';
import { Clientes } from './pantallas/Clientes.js';
import { FichaCliente } from './pantallas/FichaCliente.js';
import { Articulo } from './pantallas/Articulo.js';
import { Agenda } from './pantallas/Agenda.js';
import { Taller } from './pantallas/Taller.js';
import { Inventario, SolicitudesDeRepuesto } from './pantallas/Inventario.js';
import { Coberturas } from './pantallas/Coberturas.js';
import { Excepciones } from './pantallas/Excepciones.js';
import { Cobros, DetalleExpediente } from './pantallas/Cobros.js';
import { Indicadores } from './pantallas/Indicadores.js';
import { Administracion } from './pantallas/Administracion.js';
import { ConsultaPublica } from './pantallas/ConsultaPublica.js';

/** Envuelve una pantalla en el armazon, con su codigo del prototipo. */
function Pantalla(
  { codigo, miga, children }: DatosDePantalla & { children: JSX.Element },
): JSX.Element {
  return <Armazon pantalla={{ codigo, miga }}>{children}</Armazon>;
}

function Privado(): JSX.Element {
  const { usuario } = useSesion();
  if (usuario === null) return <Ingreso />;

  return (
    <Routes>
      <Route path="/" element={
        <Pantalla codigo="W-02" miga="Inicio"><PanelPrincipal /></Pantalla>
      } />

      <Route path="/clientes" element={
        <Pantalla codigo="W-12" miga="Clientes"><Clientes /></Pantalla>
      } />
      <Route path="/clientes/:id" element={
        <Pantalla codigo="W-13" miga="Clientes › Ficha"><FichaCliente /></Pantalla>
      } />
      <Route path="/articulos/:id" element={
        <Pantalla codigo="W-14" miga="Clientes › Articulo"><Articulo /></Pantalla>
      } />

      {/* La ruta de alta va ANTES que la de detalle: si no, "nueva" se
          interpretaria como el identificador de una orden. */}
      <Route path="/ordenes/nueva" element={
        <Pantalla codigo="W-03" miga="Ordenes › Nueva"><NuevaOrden /></Pantalla>
      } />
      <Route path="/ordenes" element={
        <Pantalla codigo="W-04" miga="Ordenes de servicio"><Ordenes /></Pantalla>
      } />
      <Route path="/ordenes/:id" element={
        <Pantalla codigo="W-05" miga="Ordenes › Detalle"><DetalleOrden /></Pantalla>
      } />

      <Route path="/agenda" element={
        <Pantalla codigo="W-06" miga="Agenda y rutas"><Agenda /></Pantalla>
      } />
      <Route path="/taller" element={
        <Pantalla codigo="W-07" miga="Cola de taller"><Taller /></Pantalla>
      } />

      <Route path="/inventario" element={
        <Pantalla codigo="W-08" miga="Inventario y bodegas"><Inventario /></Pantalla>
      } />
      <Route path="/inventario/solicitudes" element={
        <Pantalla codigo="W-08" miga="Inventario › Solicitudes"><SolicitudesDeRepuesto /></Pantalla>
      } />
      <Route path="/coberturas" element={
        <Pantalla codigo="W-15" miga="Garantias › Reglas de cobertura"><Coberturas /></Pantalla>
      } />
      <Route path="/cobros" element={
        <Pantalla codigo="W-09" miga="Expedientes de cobro"><Cobros /></Pantalla>
      } />
      <Route path="/cobros/:id" element={
        <Pantalla codigo="W-09" miga="Cobros › Expediente"><DetalleExpediente /></Pantalla>
      } />
      <Route path="/excepciones" element={
        <Pantalla codigo="W-10" miga="Excepciones de sincronizacion"><Excepciones /></Pantalla>
      } />
      <Route path="/excepciones/:id" element={
        <Pantalla codigo="W-10" miga="Excepciones de sincronizacion"><Excepciones /></Pantalla>
      } />
      <Route path="/indicadores" element={
        <Pantalla codigo="W-11" miga="Indicadores"><Indicadores /></Pantalla>
      } />
      <Route path="/administracion" element={
        <Pantalla codigo="W-16" miga="Administracion"><Administracion /></Pantalla>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
