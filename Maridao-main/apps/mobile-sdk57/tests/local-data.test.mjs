import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dataPath = new URL('../src/data/database.json', import.meta.url);
const data = JSON.parse(await readFile(dataPath, 'utf8'));

test('o banco local concentra os dados necessários no JSON do aplicativo', () => {
  assert.equal(data.meta.mode, 'local-json');
  assert.equal(data.meta.city, 'Palmas');
  assert.equal(data.meta.state, 'TO');
  assert.equal(data.services.length, 26);
  assert.equal(data.services.reduce((count, service) => count + service.specialties.length, 0), 156);
  assert.equal(data.neighborhoods.length, 380);
  assert.equal(data.coverageRegions.length, 4);
});

test('categorias, localidades e regiões têm identificadores válidos e não duplicados', () => {
  for (const values of [data.services, data.neighborhoods, data.coverageRegions]) {
    const ids = values.map((item) => item.value);
    assert.ok(ids.every((value) => typeof value === 'string' && value.length > 0));
    assert.equal(new Set(ids).size, ids.length);
  }
  const neighborhoodIds = new Set(data.neighborhoods.map((item) => item.value));
  for (const region of data.coverageRegions) {
    assert.ok(region.neighborhoods.every((value) => neighborhoodIds.has(value)));
  }
});

test('conta demonstrativa fixa existe e as coleções operacionais começam vazias', () => {
  assert.equal(data.accounts.length, 1);
  assert.equal(data.accounts[0].email, 'demo@maridao.local');
  assert.equal(data.accounts[0].password, 'MaridaoDemo2026');
  assert.equal(data.accounts[0].role, 'customer');
  for (const collection of ['requests', 'proposals', 'reviews', 'messages', 'supportProtocols']) {
    assert.deepEqual(data[collection], []);
  }
});
