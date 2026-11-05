import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarPanelEstatico } from '../../src/comun/panel-estatico.js';

describe('Panel compilado servido por el servidor', () => {
  let carpeta: string;

  beforeAll(() => {
    carpeta = mkdtempSync(path.join(tmpdir(), 'panel-'));
    writeFileSync(path.join(carpeta, 'index.html'), '<!doctype html><title>ServiTotal</title>');
    writeFileSync(path.join(carpeta, 'sw.js'), '// sw');
    mkdirSync(path.join(carpeta, 'assets'));
    writeFileSync(path.join(carpeta, 'assets', 'app-abc123.js'), 'console.log(1)');
  });
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  function aplicacion(): express.Express {
    const app = express();
    app.get('/api/v1/salud', (_p, r) => { r.json({ ok: true }); });
    montarPanelEstatico(app, carpeta);
    app.use((_p, r) => { r.status(404).json({ success: false }); });
    return app;
  }

  it('no monta nada si la carpeta no tiene index.html', () => {
    const app = express();
    expect(montarPanelEstatico(app, path.join(carpeta, 'no-existe'))).toBe(false);
  });

  it('devuelve el indice en las rutas de la SPA, sin cache', async () => {
    const respuesta = await request(aplicacion()).get('/ordenes/10482');
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('ServiTotal');
    expect(respuesta.headers['cache-control']).toBe('no-cache');
  });

  it('sirve los archivos con huella con cache larga y el service worker sin cache', async () => {
    const recurso = await request(aplicacion()).get('/assets/app-abc123.js');
    expect(recurso.status).toBe(200);
    expect(recurso.headers['cache-control']).toContain('immutable');
    const trabajador = await request(aplicacion()).get('/sw.js');
    expect(trabajador.headers['cache-control']).toBe('no-cache');
  });

  it('no tapa la API: una ruta /api desconocida sigue siendo un 404 en JSON', async () => {
    const respuesta = await request(aplicacion()).get('/api/v1/no-existe');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ success: false });
    const salud = await request(aplicacion()).get('/api/v1/salud');
    expect(salud.body).toEqual({ ok: true });
  });
});

describe('TRUST_PROXY', () => {
  it('sin la variable, la IP es la del socket; con TRUST_PROXY=1, la del cliente', async () => {
    const { construirAplicacion } = await import('../../src/aplicacion.js');
    const sinProxy = construirAplicacion();
    expect(sinProxy.get('trust proxy')).toBe(false);
    process.env['TRUST_PROXY'] = '1';
    try {
      expect(construirAplicacion().get('trust proxy')).toBe(1);
    } finally {
      delete process.env['TRUST_PROXY'];
    }
  });
});
