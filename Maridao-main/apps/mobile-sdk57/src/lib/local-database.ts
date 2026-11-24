import * as Crypto from 'expo-crypto';
import seed from '@/data/database.json';

type Option = { value: string; label: string; aliases?: string[] };
type ServiceCategory = Option & { specialties: string[] };
type Account = {
  id: string; email: string; password: string; role: 'customer' | 'provider';
  name: string; phone: string; cpf?: string; documentType?: string; document?: string;
  neighborhood: string; categories: string[]; specialties: string[]; neighborhoods: string[]; availability: string;
  disabled?: boolean; recoveryCode?: string; recoveryExpiresAt?: number;
  emailVerifiedAt?: string; emailVerificationCode?: string; emailVerificationExpiresAt?: number;
};
type RequestRecord = {
  id: string; customerId: string; category: string; description: string; neighborhood: string;
  preferredDate: string | null; preferredPeriod: string | null; status: string; createdAt: string;
  startedAt: string | null; completedAt: string | null; completionCode?: string;
  completionExpiresAt?: number; supportOpen?: boolean;
};
type Proposal = {
  id: string; requestId: string; providerId: string; amount: string; description: string;
  estimatedDuration: string; validUntil: string; status: string; version: number;
  createdAt: string; updatedAt: string | null; withdrawnAt: string | null;
};
type Review = { id: string; requestId: string; providerId: string; customerId: string; rating: number; comment: string; createdAt: string };
type Message = { id: string; requestId: string; senderId: string; message: string; createdAt: string };
type Protocol = { id: string; requestId: string; customerId: string; reason: string; description: string; status: string; createdAt: string; resolution: string | null };
type Database = {
  meta: { name: string; version: number; city: string; state: string };
  services: ServiceCategory[]; neighborhoods: Option[]; coverageRegions: (Option & { description: string; neighborhoods: string[] })[];
  accounts: Account[]; requests: RequestRecord[]; proposals: Proposal[]; reviews: Review[]; messages: Message[]; supportProtocols: Protocol[];
};

export class LocalDataError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status = 400, fields?: Record<string, string>) {
    super(message); this.name = 'LocalDataError'; this.status = status; this.fields = fields;
  }
}

// O JSON empacotado fornece os dados iniciais; suas coleções mutáveis existem apenas nesta execução do app.
const database = JSON.parse(JSON.stringify(seed)) as Database;
const sessions = new Map<string, string>();
const now = () => new Date().toISOString();
const newId = () => Crypto.randomUUID();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const labelFor = (value: string) => database.neighborhoods.find((item) => item.value === value)?.label
  ?? database.coverageRegions.find((item) => item.value === value)?.label ?? value;

function fail(message: string, status = 400, fields?: Record<string, string>): never {
  throw new LocalDataError(message, status, fields);
}
function bodyOf(options: RequestInit): Record<string, unknown> {
  if (!options.body || typeof options.body !== 'string') return {};
  try { return JSON.parse(options.body) as Record<string, unknown>; }
  catch { return fail('Os dados enviados não são um JSON válido.'); }
}
function accountById(id: string | undefined) {
  return database.accounts.find((account) => account.id === id && !account.disabled);
}
function currentUser(options: RequestInit, required = true) {
  const token = tokenFrom(options);
  const account = token ? accountById(sessions.get(token)) : undefined;
  if (!account && required) fail('Entre na sua conta para continuar.', 401);
  return account;
}
function tokenFrom(options: RequestInit) {
  return new Headers(options.headers).get('Authorization')?.replace(/^Bearer\s+/i, '');
}
function revokeSessions(accountId: string) {
  for (const [token, id] of sessions) if (id === accountId) sessions.delete(token);
}
function settingsProfile(account: Account) {
  return {
    id: account.id, name: account.name, email: account.email, phone: account.phone,
    neighborhood: account.neighborhood, categories: account.categories, specialties: account.specialties,
    neighborhoods: account.neighborhoods, availability: account.availability, role: account.role,
    email_verified_at: account.emailVerifiedAt ?? null,
  };
}
function emailValue(value: unknown) { return typeof value === 'string' ? value.trim().toLocaleLowerCase('pt-BR') : ''; }
function textValue(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function requireText(body: Record<string, unknown>, keys: string[]) {
  const fields: Record<string, string> = {};
  for (const key of keys) if (!textValue(body[key])) fields[key] = 'Preencha este campo.';
  if (Object.keys(fields).length) fail('Confira os campos destacados.', 400, fields);
}
function registerAccount(body: Record<string, unknown>, role: Account['role']) {
  const common = ['name', 'email', 'phone', 'password'];
  requireText(body, role === 'customer' ? [...common, 'cpf', 'neighborhood'] : [...common, 'document', 'availability']);
  const fields: Record<string, string> = {};
  const email = emailValue(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Informe um e-mail válido.';
  if (textValue(body.password).length < 8 || textValue(body.password).length > 128) fields.password = 'Use uma senha de 8 a 128 caracteres.';
  if (!/^\d{10,11}$/.test(textValue(body.phone).replace(/\D/g, ''))) fields.phone = 'Informe o telefone com DDD (10 ou 11 dígitos).';
  if (role === 'customer' && !/^\d{11}$/.test(textValue(body.cpf).replace(/\D/g, ''))) fields.cpf = 'Confira os números do CPF.';
  if (role === 'customer' && !database.neighborhoods.some((item) => item.value === textValue(body.neighborhood))) fields.neighborhood = 'Selecione uma localidade do catálogo.';
  if (role === 'provider') {
    for (const key of ['categories', 'specialties', 'neighborhoods']) {
      if (!Array.isArray(body[key]) || body[key].length === 0) fields[key] = 'Selecione pelo menos uma opção.';
    }
    const categories = Array.isArray(body.categories) ? body.categories as string[] : [];
    const validServices = database.services.filter((item) => categories.includes(item.value));
    const validSpecialties = new Set(validServices.flatMap((item) => item.specialties));
    if (Array.isArray(body.categories) && categories.some((value) => !database.services.some((item) => item.value === value))) fields.categories = 'Selecione categorias válidas.';
    if (Array.isArray(body.specialties) && (body.specialties as string[]).some((value) => !validSpecialties.has(value))) fields.specialties = 'Selecione especialidades compatíveis com as categorias.';
    const coverage = new Set([...database.neighborhoods, ...database.coverageRegions].map((item) => item.value));
    if (Array.isArray(body.neighborhoods) && (body.neighborhoods as string[]).some((value) => !coverage.has(value))) fields.neighborhoods = 'Selecione locais válidos no catálogo.';
  }
  if (database.accounts.some((account) => account.email === email)) fail('Já existe uma conta com este e-mail.', 409);
  if (role === 'customer' && database.accounts.some((account) => account.cpf === textValue(body.cpf).replace(/\D/g, ''))) fail('Já existe uma conta com este CPF.', 409);
  if (Object.keys(fields).length) fail('Confira os campos destacados.', 400, fields);
  const account: Account = {
    id: newId(), email, password: textValue(body.password), role,
    name: textValue(body.name), phone: textValue(body.phone).replace(/\D/g, ''),
    neighborhood: textValue(body.neighborhood), categories: Array.isArray(body.categories) ? body.categories as string[] : [],
    specialties: Array.isArray(body.specialties) ? body.specialties as string[] : [],
    neighborhoods: Array.isArray(body.neighborhoods) ? body.neighborhoods as string[] : [],
    availability: textValue(body.availability),
  };
  if (role === 'customer') account.cpf = textValue(body.cpf).replace(/\D/g, '');
  else { account.documentType = textValue(body.documentType) || 'CPF'; account.document = textValue(body.document); }
  database.accounts.push(account);
  return { id: account.id, name: account.name, city: database.meta.city, state: database.meta.state };
}
function matchesCoverage(provider: Account, neighborhood: string) {
  return provider.neighborhoods.includes('CIDADE:PALMAS') || provider.neighborhoods.includes(neighborhood)
    || database.coverageRegions.some((region) => provider.neighborhoods.includes(region.value) && region.neighborhoods.includes(neighborhood));
}
function requestForClient(request: RequestRecord, user: Account) {
  const accepted = database.proposals.find((item) => item.requestId === request.id && item.status === 'Aceita');
  const canManage = user.role === 'provider' && accepted?.providerId === user.id;
  const canConfirm = user.role === 'customer' && request.customerId === user.id && request.status === 'Em andamento';
  const supportOpen = Boolean(request.supportOpen);
  return {
    id: request.id, category: request.category, description: request.description,
    neighborhood: request.neighborhood, neighborhood_label: labelFor(request.neighborhood), city: database.meta.city, state: database.meta.state,
    preferred_date: request.preferredDate, preferred_period: request.preferredPeriod, status: request.status,
    created_at: request.createdAt, started_at: request.startedAt, completed_at: request.completedAt,
    can_manage: canManage, can_confirm: canConfirm, can_chat: Boolean(accepted) && request.status !== 'Aberta', support_open: supportOpen,
  };
}
function requestVisibleTo(request: RequestRecord, user: Account) {
  if (user.role === 'customer') return request.customerId === user.id;
  if (database.proposals.some((proposal) => proposal.requestId === request.id && proposal.providerId === user.id)) return true;
  return request.status === 'Aberta' && user.categories.includes(request.category) && matchesCoverage(user, request.neighborhood);
}
function pageResult<T>(items: T[], page: number, size = 20) {
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, hasMore: items.length > start + size };
}
function pageNumber(value: string | null) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page > 0 ? page : fail('Página inválida.');
}
function proposalView(proposal: Proposal) {
  const provider = accountById(proposal.providerId);
  return {
    id: proposal.id, amount: proposal.amount, description: proposal.description,
    estimated_duration: proposal.estimatedDuration, valid_until: proposal.validUntil,
    status: proposal.status, provider_name: provider?.name ?? 'Prestador', provider_id: proposal.providerId,
    expired: proposal.validUntil < new Date().toISOString().slice(0, 10), version: proposal.version,
    created_at: proposal.createdAt, updated_at: proposal.updatedAt, withdrawn_at: proposal.withdrawnAt,
  };
}
function getRequestOrFail(id: string) {
  const request = database.requests.find((item) => item.id === id);
  if (!request) fail('Solicitação não encontrada.', 404);
  return request;
}
function maybePage(value: string | null) { return pageNumber(value); }

/** Executa operações diretamente contra o banco JSON local; nenhuma conexão HTTP é aberta. */
export async function localDatabase(path: string, options: RequestInit = {}): Promise<any> {
  const url = new URL(path, 'http://local.maridao');
  const route = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const method = (options.method ?? 'GET').toUpperCase();
  const body = bodyOf(options);

  if (route.length === 1 && route[0] === 'catalog' && method === 'GET') {
    return clone({ services: database.services, neighborhoods: database.neighborhoods, coverageRegions: database.coverageRegions });
  }
  if (route[0] === 'customers' && route.length === 1 && method === 'POST') {
    return { message: 'Cadastro criado com sucesso.', customer: registerAccount(body, 'customer') };
  }
  if (route[0] === 'providers' && route.length === 1 && method === 'POST') {
    return { message: 'Cadastro criado com sucesso.', provider: registerAccount(body, 'provider') };
  }
  if (route[0] === 'auth' && route[1] === 'login' && method === 'POST') {
    const account = database.accounts.find((item) => item.email === emailValue(body.email) && item.password === body.password && !item.disabled);
    if (!account) fail('E-mail ou senha incorretos.', 401);
    const token = newId(); sessions.set(token, account.id);
    return { token, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() };
  }
  if (route[0] === 'auth' && route[1] === 'me' && method === 'GET') {
    const user = currentUser(options);
    return { user: { id: user!.id, name: user!.name, email: user!.email, phone: user!.phone, neighborhood: user!.neighborhood, role: user!.role, categories: user!.categories, specialties: user!.specialties, neighborhoods: user!.neighborhoods, availability: user!.availability, city: database.meta.city, state: database.meta.state } };
  }
  if (route[0] === 'auth' && route[1] === 'logout' && method === 'POST') {
    const token = new Headers(options.headers).get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!currentUser(options)) fail('Entre na sua conta para continuar.', 401);
    if (token) sessions.delete(token);
    return null;
  }
  if (route[0] === 'auth' && route[1] === 'recovery' && method === 'POST') {
    const account = database.accounts.find((item) => item.email === emailValue(body.email));
    if (account) { account.recoveryCode = String(Math.floor(100000 + Math.random() * 900000)); account.recoveryExpiresAt = Date.now() + 15 * 60 * 1000; }
    return account
      ? { message: 'Código de recuperação local gerado. Ele não é enviado por e-mail.', code: account.recoveryCode }
      : { message: 'Se o endereço existir, há um código local disponível; nenhuma mensagem é enviada por e-mail.' };
  }
  if (route[0] === 'auth' && route[1] === 'reset-password' && method === 'POST') {
    const account = database.accounts.find((item) => item.email === emailValue(body.email));
    if (!account || account.recoveryCode !== textValue(body.token) || (account.recoveryExpiresAt ?? 0) < Date.now()) fail('Código inválido ou expirado.', 400);
    const password = textValue(body.newPassword);
    if (password.length < 8 || password.length > 128) fail('Use uma senha de 8 a 128 caracteres.', 400, { newPassword: 'Use uma senha de 8 a 128 caracteres.' });
    account.password = password; account.recoveryCode = undefined; account.recoveryExpiresAt = undefined;
    return { message: 'Senha redefinida. Entre novamente.' };
  }

  if (route.length === 1 && route[0] === 'account' && method === 'GET') {
    const user = currentUser(options)!;
    return clone({ profile: settingsProfile(user), mailMode: 'local' });
  }
  if (route.length === 1 && route[0] === 'account' && method === 'PATCH') {
    const user = currentUser(options)!;
    requireText(body, ['name', 'phone', 'currentPassword']);
    if (user.password !== textValue(body.currentPassword)) fail('A senha atual está incorreta.', 400, { currentPassword: 'Confira sua senha atual.' });
    const fields: Record<string, string> = {};
    const name = textValue(body.name);
    const phone = textValue(body.phone).replace(/\D/g, '');
    if (name.length > 150) fields.name = 'Use até 150 caracteres.';
    if (!/^\d{10,11}$/.test(phone)) fields.phone = 'Informe o telefone com DDD (10 ou 11 dígitos).';
    if (user.role === 'customer') {
      const neighborhood = textValue(body.neighborhood);
      if (!database.neighborhoods.some((item) => item.value === neighborhood)) fields.neighborhood = 'Selecione uma localidade do catálogo.';
      if (Object.keys(fields).length) fail('Confira os campos destacados.', 400, fields);
      user.name = name; user.phone = phone; user.neighborhood = neighborhood;
    } else {
      const categories = Array.isArray(body.categories) && body.categories.every((value) => typeof value === 'string') ? body.categories as string[] : [];
      const specialties = Array.isArray(body.specialties) && body.specialties.every((value) => typeof value === 'string') ? body.specialties as string[] : [];
      const neighborhoods = Array.isArray(body.neighborhoods) && body.neighborhoods.every((value) => typeof value === 'string') ? body.neighborhoods as string[] : [];
      const availability = textValue(body.availability);
      const services = database.services.filter((item) => categories.includes(item.value));
      const validSpecialties = new Set(services.flatMap((item) => item.specialties));
      const validNeighborhoods = new Set([...database.neighborhoods, ...database.coverageRegions].map((item) => item.value));
      if (!categories.length || categories.some((value) => !database.services.some((item) => item.value === value))) fields.categories = 'Selecione pelo menos uma categoria válida.';
      if (!specialties.length || specialties.some((value) => !validSpecialties.has(value))) fields.specialties = 'Selecione especialidades compatíveis com as categorias.';
      if (!neighborhoods.length || neighborhoods.some((value) => !validNeighborhoods.has(value))) fields.neighborhoods = 'Selecione pelo menos um local válido.';
      if (!availability || availability.length > 500) fields.availability = 'Informe a disponibilidade, com até 500 caracteres.';
      if (Object.keys(fields).length) fail('Confira os campos destacados.', 400, fields);
      user.name = name; user.phone = phone; user.categories = categories; user.specialties = specialties;
      user.neighborhoods = neighborhoods; user.availability = availability;
    }
    return { message: 'Perfil atualizado com sucesso.' };
  }
  if (route[0] === 'account' && route[1] === 'password' && route.length === 2 && method === 'POST') {
    const user = currentUser(options)!;
    requireText(body, ['currentPassword', 'newPassword']);
    if (user.password !== textValue(body.currentPassword)) fail('A senha atual está incorreta.', 400, { currentPassword: 'Confira sua senha atual.' });
    const newPassword = textValue(body.newPassword);
    if (newPassword.length < 8 || newPassword.length > 128) fail('Use uma senha de 8 a 128 caracteres.', 400, { newPassword: 'Use uma senha de 8 a 128 caracteres.' });
    user.password = newPassword;
    revokeSessions(user.id);
    return { message: 'Senha alterada. Entre novamente com a nova senha.' };
  }
  if (route[0] === 'account' && route[1] === 'close' && route.length === 2 && method === 'POST') {
    const user = currentUser(options)!;
    requireText(body, ['currentPassword']);
    if (user.password !== textValue(body.currentPassword)) fail('A senha atual está incorreta.', 400, { currentPassword: 'Confira sua senha atual.' });
    const hasActiveRequest = database.requests.some((request) => {
      if (!['Aceita', 'Em andamento'].includes(request.status)) return false;
      if (user.role === 'customer') return request.customerId === user.id;
      return database.proposals.some((proposal) => proposal.requestId === request.id && proposal.providerId === user.id && proposal.status === 'Aceita');
    });
    if (hasActiveRequest) fail('Resolva os atendimentos aceitos ou em andamento antes de encerrar o acesso à conta.', 409);
    user.disabled = true;
    revokeSessions(user.id);
    return { message: 'Acesso à conta encerrado. Os pedidos e registros foram preservados.' };
  }
  if (route[0] === 'account' && route[1] === 'verify-email' && route.length === 2 && method === 'POST') {
    const user = currentUser(options)!;
    if (user.emailVerifiedAt) return { message: 'Este e-mail já está confirmado.' };
    user.emailVerificationCode = String(Math.floor(100000 + Math.random() * 900000));
    user.emailVerificationExpiresAt = Date.now() + 15 * 60 * 1000;
    return { message: 'Código local de confirmação gerado. Nenhum e-mail foi enviado.', code: user.emailVerificationCode };
  }
  if (route[0] === 'account' && route[1] === 'confirm-email' && route.length === 2 && method === 'POST') {
    const user = currentUser(options)!;
    requireText(body, ['token']);
    if (user.emailVerifiedAt) return { message: 'Este e-mail já está confirmado.' };
    if (!user.emailVerificationCode || user.emailVerificationCode !== textValue(body.token) || (user.emailVerificationExpiresAt ?? 0) < Date.now()) {
      fail('Código inválido ou expirado. Solicite outro código local.', 400, { token: 'Confira o código de confirmação.' });
    }
    user.emailVerifiedAt = now();
    user.emailVerificationCode = undefined;
    user.emailVerificationExpiresAt = undefined;
    return { message: 'E-mail confirmado com sucesso.' };
  }

  if (route[0] === 'providers' && route.length === 1 && method === 'GET') {
    const user = currentUser(options)!;
    if (user.role !== 'customer') fail('Esta busca está disponível para clientes.', 403);
    const category = url.searchParams.get('category') ?? '';
    const neighborhood = url.searchParams.get('neighborhood') ?? '';
    const page = maybePage(url.searchParams.get('page'));
    const providers = database.accounts.filter((item) => item.role === 'provider' && !item.disabled
      && (!category || item.categories.some((value) => value.toLocaleLowerCase('pt-BR').includes(category.toLocaleLowerCase('pt-BR'))))
      && (!neighborhood || matchesCoverage(item, neighborhood) || item.neighborhoods.some((value) => value.toLocaleLowerCase('pt-BR').includes(neighborhood.toLocaleLowerCase('pt-BR')))))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((item) => ({ id: item.id, name: item.name, categories: item.categories, specialties: item.specialties, neighborhoods: item.neighborhoods, coverageLabels: item.neighborhoods.map(labelFor), availability: item.availability, city: database.meta.city, state: database.meta.state }));
    const result = pageResult(providers, page);
    return { providers: result.items, page, hasMore: result.hasMore };
  }
  if (route[0] === 'providers' && route[2] === 'profile' && method === 'GET') {
    const viewer = currentUser(options)!;
    const provider = accountById(route[1]);
    if (!provider || provider.role !== 'provider') fail('Perfil profissional não encontrado.', 404);
    const page = maybePage(url.searchParams.get('page'));
    const reviews = database.reviews.filter((review) => review.providerId === provider.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = pageResult(reviews, page);
    return { provider: { name: provider.name, categories: provider.categories, specialties: provider.specialties, neighborhoods: provider.neighborhoods, availability: provider.availability, city: database.meta.city, state: database.meta.state, rating: reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : null, review_count: reviews.length }, reviews: result.items.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, created_at: review.createdAt })), page, hasMore: result.hasMore, viewer: viewer.id };
  }

  if (route[0] === 'requests' && route.length === 1 && method === 'POST') {
    const user = currentUser(options)!;
    if (user.role !== 'customer') fail('Somente clientes podem publicar solicitações.', 403);
    requireText(body, ['category', 'description', 'neighborhood']);
    const fields: Record<string, string> = {};
    if (!database.services.some((item) => item.value === textValue(body.category))) fields.category = 'Selecione um serviço do catálogo.';
    if (!database.neighborhoods.some((item) => item.value === textValue(body.neighborhood))) fields.neighborhood = 'Selecione uma localidade do catálogo.';
    if (textValue(body.description).length > 3000) fields.description = 'Use até 3.000 caracteres.';
    if (Object.keys(fields).length) fail('Confira os campos destacados.', 400, fields);
    const category = textValue(body.category);
    const open = database.requests.filter((item) => item.customerId === user.id && item.category === category && item.status === 'Aberta');
    open.forEach((item) => { item.status = 'Cancelada'; });
    const request: RequestRecord = { id: newId(), customerId: user.id, category, description: textValue(body.description), neighborhood: textValue(body.neighborhood), preferredDate: textValue(body.preferredDate) || null, preferredPeriod: textValue(body.preferredPeriod) || null, status: 'Aberta', createdAt: now(), startedAt: null, completedAt: null };
    database.requests.push(request);
    return { request: requestForClient(request, user), cancelledCount: open.length };
  }
  if (route[0] === 'requests' && route[1] === 'history' && method === 'GET') {
    const user = currentUser(options)!; const page = maybePage(url.searchParams.get('page'));
    const entries = database.requests.filter((request) => requestVisibleTo(request, user) && request.status !== 'Aberta').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = pageResult(entries, page);
    return { requests: result.items.map((request) => {
      const proposal = database.proposals.find((item) => item.requestId === request.id && (user.role === 'customer' ? item.status === 'Aceita' : item.providerId === user.id));
      const view = requestForClient(request, user);
      return { ...view, proposal_id: proposal?.id ?? null, proposal_amount: proposal?.amount ?? null, proposal_status: proposal?.status ?? null, proposal_created_at: proposal?.createdAt ?? null, proposal_updated_at: proposal?.updatedAt ?? null, withdrawn_at: proposal?.withdrawnAt ?? null };
    }), role: user.role, page, hasMore: result.hasMore };
  }
  if (route[0] === 'requests' && route.length === 1 && method === 'GET') {
    const user = currentUser(options)!; const page = maybePage(url.searchParams.get('page'));
    const entries = database.requests.filter((request) => requestVisibleTo(request, user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = pageResult(entries, page);
    return { requests: result.items.map((request) => requestForClient(request, user)), role: user.role, page, hasMore: result.hasMore };
  }

  if (route[0] === 'requests' && route.length >= 3) {
    const user = currentUser(options)!;
    const request = getRequestOrFail(route[1]);
    if (!requestVisibleTo(request, user)) fail('Você não tem acesso a esta solicitação.', 403);
    const action = route[2];
    const requestProposals = database.proposals.filter((item) => item.requestId === request.id);
    if (action === 'proposals' && method === 'GET') {
      const page = maybePage(url.searchParams.get('page'));
      const visible = user.role === 'customer' ? requestProposals : requestProposals.filter((item) => item.providerId === user.id);
      const result = pageResult(visible, page);
      return { request: requestForClient(request, user), proposals: result.items.map(proposalView), role: user.role, page, hasMore: result.hasMore };
    }
    if (action === 'proposals' && route.length === 3 && method === 'POST') {
      if (user.role !== 'provider') fail('Somente prestadores podem enviar propostas.', 403);
      if (request.status !== 'Aberta' || !user.categories.includes(request.category) || !matchesCoverage(user, request.neighborhood)) fail('Esta solicitação não está disponível para seu perfil.', 409);
      if (requestProposals.some((item) => item.providerId === user.id)) fail('Você já enviou uma proposta para este pedido.', 409);
      requireText(body, ['amount', 'description', 'estimatedDuration', 'validUntil']);
      const amount = Number(textValue(body.amount).replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) fail('Informe um valor válido.', 400, { amount: 'Informe um valor maior que zero.' });
      const proposal: Proposal = { id: newId(), requestId: request.id, providerId: user.id, amount: amount.toFixed(2), description: textValue(body.description), estimatedDuration: textValue(body.estimatedDuration), validUntil: textValue(body.validUntil), status: 'Pendente', version: 1, createdAt: now(), updatedAt: null, withdrawnAt: null };
      database.proposals.push(proposal); return { proposal: proposalView(proposal) };
    }
    if (action === 'proposals' && route.length === 4 && method === 'PATCH') {
      const proposal = requestProposals.find((item) => item.id === route[3] && item.providerId === user.id);
      if (!proposal || proposal.status !== 'Pendente' || request.status !== 'Aberta') fail('Esta proposta não pode ser alterada.', 409);
      requireText(body, ['amount', 'description', 'estimatedDuration', 'validUntil']);
      const amount = Number(textValue(body.amount).replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) fail('Informe um valor válido.', 400, { amount: 'Informe um valor maior que zero.' });
      proposal.amount = amount.toFixed(2); proposal.description = textValue(body.description); proposal.estimatedDuration = textValue(body.estimatedDuration); proposal.validUntil = textValue(body.validUntil); proposal.updatedAt = now(); proposal.version += 1;
      return { proposal: proposalView(proposal) };
    }
    if (action === 'proposals' && route.length === 5 && route[4] === 'accept' && method === 'POST') {
      if (user.role !== 'customer' || request.customerId !== user.id || request.status !== 'Aberta') fail('Esta proposta não pode ser aceita.', 409);
      const proposal = requestProposals.find((item) => item.id === route[3] && item.status === 'Pendente');
      if (!proposal || proposal.validUntil < new Date().toISOString().slice(0, 10)) fail('A proposta expirou ou não está disponível.', 409);
      proposal.status = 'Aceita'; proposal.version += 1;
      requestProposals.filter((item) => item.id !== proposal.id && item.status === 'Pendente').forEach((item) => { item.status = 'Não selecionada'; item.version += 1; });
      request.status = 'Aceita';
      return { request: requestForClient(request, user), proposal: proposalView(proposal) };
    }
    if (action === 'proposals' && route.length === 5 && route[4] === 'withdraw' && method === 'POST') {
      const proposal = requestProposals.find((item) => item.id === route[3] && item.providerId === user.id && item.status === 'Pendente');
      if (!proposal || request.status !== 'Aberta') fail('Esta proposta não pode ser retirada.', 409);
      proposal.status = 'Retirada'; proposal.withdrawnAt = now(); proposal.version += 1;
      return { proposal: proposalView(proposal) };
    }
    if (action === 'status' && method === 'POST') {
      const target = textValue(body.status);
      const accepted = requestProposals.find((item) => item.status === 'Aceita');
      if (!accepted || (user.role === 'provider' && accepted.providerId !== user.id)) fail('Você não pode atualizar este atendimento.', 403);
      if (target === 'Em andamento' && user.role === 'provider' && request.status === 'Aceita') { request.status = target; request.startedAt = now(); }
      else if (target === 'Concluída' && user.role === 'provider' && request.status === 'Em andamento') {
        if (!request.completionCode || (request.completionExpiresAt ?? 0) < Date.now() || textValue(body.code) !== request.completionCode) fail('Código de conclusão inválido ou expirado.', 400, { code: 'Confira o código autorizado pelo cliente.' });
        request.status = target; request.completedAt = now(); request.completionCode = undefined;
      } else fail('Esta alteração de status não está disponível.', 409);
      return { request: requestForClient(request, user) };
    }
    if (action === 'completion-code' && method === 'POST') {
      if (user.role !== 'customer' || request.customerId !== user.id || request.status !== 'Em andamento' || request.supportOpen) fail('Não é possível autorizar a conclusão deste atendimento.', 409);
      const customer = accountById(request.customerId)!; const code = customer.phone.slice(-4);
      request.completionCode = code; request.completionExpiresAt = Date.now() + 10 * 60 * 1000;
      return { code, expiresAt: new Date(request.completionExpiresAt).toISOString() };
    }
    if (action === 'support' && method === 'GET') {
      if (user.role !== 'customer' || request.customerId !== user.id) fail('Somente o cliente pode consultar os protocolos.', 403);
      return { protocols: database.supportProtocols.filter((item) => item.requestId === request.id && item.customerId === user.id).map((item) => ({ id: item.id, status: item.status, reason: item.reason, description: item.description, created_at: item.createdAt, resolution: item.resolution })) };
    }
    if (action === 'support' && method === 'POST') {
      if (user.role !== 'customer' || request.customerId !== user.id || !['Aceita', 'Em andamento', 'Cancelada'].includes(request.status)) fail('Não é possível registrar um protocolo para este pedido.', 409);
      requireText(body, ['reason', 'description']);
      const protocol: Protocol = { id: newId().slice(0, 8).toUpperCase(), requestId: request.id, customerId: user.id, reason: textValue(body.reason), description: textValue(body.description), status: 'Em análise', createdAt: now(), resolution: null };
      database.supportProtocols.push(protocol); request.supportOpen = true; request.completionCode = undefined;
      return { id: protocol.id, protocol };
    }
    if (action === 'review' && method === 'GET') {
      const review = database.reviews.find((item) => item.requestId === request.id && item.customerId === user.id);
      return { review: review ? { rating: review.rating, comment: review.comment } : null };
    }
    if (action === 'review' && method === 'POST') {
      const accepted = requestProposals.find((item) => item.status === 'Aceita');
      if (user.role !== 'customer' || request.customerId !== user.id || request.status !== 'Concluída' || !accepted) fail('A avaliação fica disponível após a conclusão do serviço.', 409);
      if (database.reviews.some((item) => item.requestId === request.id && item.customerId === user.id)) fail('Este atendimento já foi avaliado.', 409);
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('Selecione uma nota de 1 a 5.', 400);
      const review: Review = { id: newId(), requestId: request.id, providerId: accepted.providerId, customerId: user.id, rating, comment: textValue(body.comment), createdAt: now() };
      database.reviews.push(review); return { review: { rating: review.rating, comment: review.comment } };
    }
    if (action === 'messages' && method === 'GET') {
      const accepted = requestProposals.find((item) => item.status === 'Aceita');
      const canSend = Boolean(accepted) && request.status !== 'Concluída' && request.status !== 'Cancelada'
        && (user.id === request.customerId || user.id === accepted?.providerId);
      const allMessages = database.messages.filter((item) => item.requestId === request.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const before = url.searchParams.get('before');
      const beforeIndex = before ? allMessages.findIndex((item) => item.id === before) : -1;
      const available = beforeIndex >= 0 ? allMessages.slice(0, beforeIndex) : allMessages;
      const messages = available.slice(-50);
      return { messages: messages.map((item) => ({ id: item.id, mine: item.senderId === user.id, message: item.message, created_at: item.createdAt })), hasMore: available.length > messages.length, canSend };
    }
    if (action === 'messages' && method === 'POST') {
      const accepted = requestProposals.find((item) => item.status === 'Aceita');
      if (!accepted || request.status === 'Concluída' || request.status === 'Cancelada' || (user.id !== request.customerId && user.id !== accepted.providerId)) fail('A conversa não está disponível.', 409);
      requireText(body, ['message']);
      const message = textValue(body.message);
      if (message.length > 2000) fail('A mensagem excede 2.000 caracteres.');
      const record: Message = { id: newId(), requestId: request.id, senderId: user.id, message, createdAt: now() };
      database.messages.push(record);
      return { id: record.id, created_at: record.createdAt };
    }
  }
  fail('Operação não disponível no banco JSON local.', 404);
}

/** Limpa os dados alterados nesta execução; útil para testes e desenvolvimento. */
export function resetLocalDatabase() {
  const fresh = JSON.parse(JSON.stringify(seed)) as Database;
  database.services = fresh.services; database.neighborhoods = fresh.neighborhoods; database.coverageRegions = fresh.coverageRegions;
  database.accounts = fresh.accounts; database.requests = fresh.requests; database.proposals = fresh.proposals;
  database.reviews = fresh.reviews; database.messages = fresh.messages; database.supportProtocols = fresh.supportProtocols;
  sessions.clear();
}
