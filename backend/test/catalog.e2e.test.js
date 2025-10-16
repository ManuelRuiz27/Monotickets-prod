import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';

import { createServer } from '../src/server.js';
import { initializeDatabase } from '../src/db/bootstrap.js';
import { query } from '../src/db/index.js';

async function insertMerchant(row) {
  const values = [
    row.id || randomUUID(),
    row.nombre,
    row.categoria,
    row.municipio,
    row.descuento ?? 0,
    row.direccion,
    row.horario,
    row.descripcion ?? null,
    row.lat ?? null,
    row.lng ?? null,
    row.activo ?? true,
  ];

  await query(
    `INSERT INTO merchants (
      id, nombre, categoria, municipio, descuento, direccion, horario, descripcion, lat, lng, activo
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    values,
  );
}

async function resetMerchants() {
  await query('DELETE FROM merchants');
}

describe('Catalog endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.DB_DRIVER = 'memory';
    process.env.DB_SKIP_SEED = '1';
    process.env.REDIS_DRIVER = 'memory';
    process.env.REDIS_URL = 'memory://local';
    process.env.QUEUES_DISABLED = '1';
    process.env.JWT_SECRET = 'catalog-secret';

    await initializeDatabase({ env: process.env });

    server = createServer({ env: process.env });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://${address.address}:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(async () => {
    await resetMerchants();
  });

  it('returns paginated catalog without filters', async () => {
    await insertMerchant({
      id: '11111111-1111-1111-1111-111111111111',
      nombre: 'Cafe Central',
      categoria: 'cafeteria',
      municipio: 'Monterrey',
      descuento: 10,
      direccion: 'Av. Central 100',
      horario: '08:00-20:00',
      descripcion: 'Cafeteria de especialidad',
      lat: 25.675,
      lng: -100.318,
    });
    await insertMerchant({
      id: '22222222-2222-2222-2222-222222222222',
      nombre: 'Taqueria Norte',
      categoria: 'restaurante',
      municipio: 'Monterrey',
      descuento: 15,
      direccion: 'Calle Norte 50',
      horario: '12:00-02:00',
      descripcion: 'Autentica taqueria',
    });
    await insertMerchant({
      id: '33333333-3333-3333-3333-333333333333',
      nombre: 'Panaderia Dulce',
      categoria: 'panaderia',
      municipio: 'Guadalupe',
      descuento: 5,
      direccion: 'Av. Dulce 25',
      horario: '07:00-19:00',
      activo: false,
    });

    const response = await fetch(`${baseUrl}/catalog`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 20);
    assert.equal(body.total, 2);
    assert.equal(body.totalPages, 1);
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.items.map((item) => item.nombre), ['Cafe Central', 'Taqueria Norte']);
    assert.equal(body.items[0].lat, 25.675);
    assert.equal(body.items[0].lng, -100.318);
  });

  it('filters catalog by categoria', async () => {
    await insertMerchant({
      nombre: 'Heladeria Sur',
      categoria: 'postres',
      municipio: 'Guadalupe',
      descuento: 12,
      direccion: 'Calle Sur 10',
      horario: '11:00-21:00',
    });
    await insertMerchant({
      nombre: 'Tienda Norte',
      categoria: 'tienda',
      municipio: 'Monterrey',
      descuento: 8,
      direccion: 'Av. Norte 200',
      horario: '09:00-19:00',
    });

    const response = await fetch(`${baseUrl}/catalog?categoria=postres`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].nombre, 'Heladeria Sur');
  });

  it('filters catalog by municipio', async () => {
    await insertMerchant({
      nombre: 'Loncheria Centro',
      categoria: 'loncheria',
      municipio: 'Monterrey',
      descuento: 5,
      direccion: 'Centro 1',
      horario: '08:00-16:00',
    });
    await insertMerchant({
      nombre: 'Mercado Oriente',
      categoria: 'mercado',
      municipio: 'Guadalupe',
      descuento: 3,
      direccion: 'Oriente 2',
      horario: '09:00-18:00',
    });

    const response = await fetch(`${baseUrl}/catalog?municipio=Guadalupe`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.total, 1);
    assert.equal(body.items[0].municipio, 'Guadalupe');
  });

  it('filters catalog by search query', async () => {
    await insertMerchant({
      nombre: 'Bistro Gourmet',
      categoria: 'restaurante',
      municipio: 'San Pedro',
      descuento: 20,
      direccion: 'Av. Vasconcelos 300',
      horario: '13:00-23:00',
      descripcion: 'Comida gourmet internacional',
    });
    await insertMerchant({
      nombre: 'Tortilleria La Abuela',
      categoria: 'tortilleria',
      municipio: 'San Nicolas',
      descuento: 4,
      direccion: 'Av. Universidad 500',
      horario: '06:00-15:00',
    });

    const response = await fetch(`${baseUrl}/catalog?q=gourmet`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.total, 1);
    assert.equal(body.items[0].nombre, 'Bistro Gourmet');
  });

  it('supports combined filters', async () => {
    await insertMerchant({
      nombre: 'Parrilla Norteña',
      categoria: 'restaurante',
      municipio: 'Monterrey',
      descuento: 18,
      direccion: 'Av. Fundidora 10',
      horario: '12:00-23:00',
      descripcion: 'Cortes y tacos',
    });
    await insertMerchant({
      nombre: 'Parrilla del Sur',
      categoria: 'restaurante',
      municipio: 'Guadalupe',
      descuento: 18,
      direccion: 'Av. Revolucion 20',
      horario: '12:00-23:00',
      descripcion: 'Cortes y tacos',
    });

    const response = await fetch(
      `${baseUrl}/catalog?categoria=restaurante&municipio=Monterrey&q=parrilla`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].nombre, 'Parrilla Norteña');
  });

  it('caps pageSize to the configured maximum', async () => {
    const merchants = Array.from({ length: 60 }, (_, index) => ({
      nombre: `Merchant ${String(index).padStart(2, '0')}`,
      categoria: 'tienda',
      municipio: 'Monterrey',
      descuento: 5,
      direccion: `Calle ${index}`,
      horario: '09:00-18:00',
    }));

    for (const merchant of merchants) {
      await insertMerchant(merchant);
    }

    const response = await fetch(`${baseUrl}/catalog?pageSize=100`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.pageSize, 50);
    assert.equal(body.items.length, 50);
    assert.equal(body.total, 60);
    assert.equal(body.totalPages, 2);
    assert.equal(body.items[0].nombre, 'Merchant 00');
  });

  it('returns merchant details by id', async () => {
    await insertMerchant({
      id: '99999999-9999-4999-9999-999999999999',
      nombre: 'Galeria Arte Vivo',
      categoria: 'galeria',
      municipio: 'San Pedro',
      descuento: 7,
      direccion: 'Av. Calzada 100',
      horario: '10:00-19:00',
      descripcion: 'Arte local',
      lat: 25.66,
      lng: -100.35,
    });

    const response = await fetch(`${baseUrl}/catalog/99999999-9999-4999-9999-999999999999`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.nombre, 'Galeria Arte Vivo');
    assert.equal(body.categoria, 'galeria');
    assert.equal(body.lat, 25.66);
    assert.equal(body.lng, -100.35);
  });

  it('returns 404 when catalog item is missing or inactive', async () => {
    await insertMerchant({
      id: 'aaaaaaa1-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      nombre: 'Local Oculto',
      categoria: 'oculto',
      municipio: 'San Pedro',
      descuento: 0,
      direccion: 'Calle oculta',
      horario: '00:00-00:00',
      activo: false,
    });

    const missingResponse = await fetch(`${baseUrl}/catalog/12345678-1234-1234-1234-123456789000`);
    assert.equal(missingResponse.status, 404);
    const inactiveResponse = await fetch(`${baseUrl}/catalog/aaaaaaa1-aaaa-4aaa-aaaa-aaaaaaaaaaaa`);
    assert.equal(inactiveResponse.status, 404);
  });
});
