import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = new URL('../src/lib/local-database.ts', import.meta.url);
const seedPath = new URL('../src/data/database.json', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const seed = JSON.parse(await readFile(seedPath, 'utf8'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
const load = (id) => {
  if (id === 'expo-crypto') return { randomUUID };
  if (id === '@/data/database.json') return seed;
  return require(id);
};
runInNewContext(compiled, { exports: module.exports, require: load, module, Headers, URL });
const { localDatabase, resetLocalDatabase, LocalDataError } = module.exports;
const asJson = (body) => ({ method: 'POST', body: JSON.stringify(body) });
const auth = (token, method = 'GET', body) => ({
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function loginAs(email = 'demo@maridao.local', password = 'MaridaoDemo2026') {
  const result = await localDatabase('/auth/login', asJson({ email, password }));
  return result.token;
}
const login = (password = 'MaridaoDemo2026') => loginAs('demo@maridao.local', password);

beforeEach(() => resetLocalDatabase());

test('GET /account devolve perfil e PATCH atualiza os dados de cliente', async () => {
  const token = await login();
  const initial = await localDatabase('/account', auth(token));
  assert.equal(initial.mailMode, 'local');
  assert.equal(initial.profile.name, 'Cliente de demonstração');
  const neighborhood = seed.neighborhoods[1].value;
  const result = await localDatabase('/account', auth(token, 'PATCH', {
    name: 'Cliente Atualizado', phone: '(63) 98888-7777', neighborhood,
    currentPassword: 'MaridaoDemo2026',
  }));
  assert.match(result.message, /atualizado/i);
  const updated = await localDatabase('/account', auth(token));
  assert.equal(updated.profile.name, 'Cliente Atualizado');
  assert.equal(updated.profile.phone, '63988887777');
  assert.equal(updated.profile.neighborhood, neighborhood);
});

test('PATCH /account atualiza os campos profissionais do prestador', async () => {
  const service = seed.services[0];
  const email = 'prestador@maridao.local';
  const password = 'Prestador2026';
  const neighborhood = seed.neighborhoods[0].value;
  await localDatabase('/providers', asJson({
    name: 'Prestador de teste', email, phone: '63999998888', password, document: '12345678901',
    documentType: 'CPF', categories: [service.value], specialties: [service.specialties[0]],
    neighborhoods: [neighborhood], availability: 'De segunda a sexta',
  }));
  const token = await loginAs(email, password);
  const result = await localDatabase('/account', auth(token, 'PATCH', {
    name: 'Prestador atualizado', phone: '63988887777', categories: [service.value],
    specialties: [service.specialties[0]], neighborhoods: [seed.coverageRegions[0].value],
    availability: 'Finais de semana', currentPassword: password,
  }));
  assert.match(result.message, /atualizado/i);
  const profile = await localDatabase('/account', auth(token));
  assert.equal(profile.profile.name, 'Prestador atualizado');
  assert.equal(profile.profile.neighborhoods[0], seed.coverageRegions[0].value);
  assert.equal(profile.profile.availability, 'Finais de semana');
});

test('PATCH /account rejeita senha atual incorreta sem alterar o perfil', async () => {
  const token = await login();
  await assert.rejects(
    localDatabase('/account', auth(token, 'PATCH', {
      name: 'Não deve salvar', phone: '63999999999', neighborhood: seed.neighborhoods[0].value,
      currentPassword: 'senha-incorreta',
    })),
    (error) => error instanceof LocalDataError && error.status === 400,
  );
  const profile = await localDatabase('/account', auth(token));
  assert.equal(profile.profile.name, 'Cliente de demonstração');
});

test('POST /account/verify-email e /confirm-email geram e validam código local', async () => {
  const token = await login();
  const generated = await localDatabase('/account/verify-email', auth(token, 'POST', {}));
  assert.match(generated.code, /^\d{6}$/);
  await assert.rejects(
    localDatabase('/account/confirm-email', auth(token, 'POST', { token: '000000' })),
    (error) => error instanceof LocalDataError && error.status === 400,
  );
  const confirmed = await localDatabase('/account/confirm-email', auth(token, 'POST', { token: generated.code }));
  assert.match(confirmed.message, /confirmado/i);
  const profile = await localDatabase('/account', auth(token));
  assert.ok(profile.profile.email_verified_at);
});

test('POST /account/password altera credencial e revoga a sessão anterior', async () => {
  const token = await login();
  const result = await localDatabase('/account/password', auth(token, 'POST', {
    currentPassword: 'MaridaoDemo2026', newPassword: 'NovaSenha2026',
  }));
  assert.match(result.message, /senha alterada/i);
  await assert.rejects(
    localDatabase('/account', auth(token)),
    (error) => error instanceof LocalDataError && error.status === 401,
  );
  const newToken = await login('NovaSenha2026');
  assert.equal((await localDatabase('/account', auth(newToken))).profile.email, 'demo@maridao.local');
});

test('POST /account/close encerra login e preserva os registros locais', async () => {
  const token = await login();
  const result = await localDatabase('/account/close', auth(token, 'POST', { currentPassword: 'MaridaoDemo2026' }));
  assert.match(result.message, /acesso.*encerrado/i);
  await assert.rejects(
    localDatabase('/account', auth(token)),
    (error) => error instanceof LocalDataError && error.status === 401,
  );
  await assert.rejects(
    login(),
    (error) => error instanceof LocalDataError && error.status === 401,
  );
});
