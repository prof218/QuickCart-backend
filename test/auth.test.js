/**
 * Authentication integration tests (node:test).
 * These run against the real MongoDB in MONGODB_URI and clean up after themselves.
 * If MONGODB_URI or JWT_SECRET is not configured, the suite is skipped (not failed).
 *
 * Run: npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';

// Ensure auth works even if the developer's .env has no JWT_SECRET.
if (!config.jwtSecret) config.jwtSecret = 'test-secret-for-ci-only';

const EMAIL = `test+${Date.now()}@quickcart.test`;
const PASSWORD = 'Str0ngPass1';

let server;
let base;
let mongod;
let setupError = null;
const jar = {};

function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const pair = c.split(';')[0];
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (val === '') delete jar[name];
    else jar[name] = val;
  }
}
function cookieHeader() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}
async function api(method, path, { body, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const ck = cookieHeader();
  if (ck) headers.Cookie = ck;
  if (csrf && jar[config.csrfCookieName]) headers['x-csrf-token'] = jar[config.csrfCookieName];
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

before(async () => {
  try {
    // Self-contained: spin up an in-memory MongoDB so tests need no external DB.
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  } catch (err) {
    setupError = err;
  }
});

after(async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('auth suite', async (t) => {
  if (setupError) {
    t.skip(`in-memory MongoDB unavailable: ${setupError.message}`);
    return;
  }
  await t.test('register creates a user and sets session cookies', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { name: 'Test User', email: EMAIL, password: PASSWORD },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.data.user.email, EMAIL);
    assert.equal(r.data.data.user.passwordHash, undefined, 'passwordHash must not be returned');
    assert.ok(jar[config.authCookieName], 'auth cookie set');
    assert.ok(jar[config.csrfCookieName], 'csrf cookie set');
  });

  await t.test('password is stored as a bcrypt hash, not plaintext', async () => {
    const u = await User.findOne({ email: EMAIL }).select('+passwordHash');
    assert.ok(u.passwordHash, 'hash present');
    assert.notEqual(u.passwordHash, PASSWORD);
    assert.match(u.passwordHash, /^\$2[aby]\$/, 'bcrypt format');
  });

  await t.test('duplicate email registration is rejected (409)', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { name: 'Dupe', email: EMAIL, password: PASSWORD },
    });
    assert.equal(r.status, 409);
    assert.equal(r.data.success, false);
  });

  await t.test('register validation rejects weak password (400)', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { name: 'Weak', email: `weak+${Date.now()}@quickcart.test`, password: 'short' },
    });
    assert.equal(r.status, 400);
    assert.ok(Array.isArray(r.data.error.details));
  });

  await t.test('GET /me returns current user when authenticated', async () => {
    const r = await api('GET', '/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.data.data.user.email, EMAIL);
  });

  await t.test('protected payment endpoint rejects requests after logout (and guests)', async () => {
    // logout without CSRF header → 403
    const noCsrf = await api('POST', '/api/auth/logout');
    assert.equal(noCsrf.status, 403);
    // logout with CSRF → 200, cookies cleared
    const out = await api('POST', '/api/auth/logout', { csrf: true });
    assert.equal(out.status, 200);
    assert.equal(jar[config.authCookieName], undefined, 'auth cookie cleared');
    // /me now unauthorized
    const me = await api('GET', '/api/auth/me');
    assert.equal(me.status, 401);
    // guest cannot create a payment order
    const guest = await api('POST', '/api/payments/create-order', {
      body: { customer: { name: 'x', email: 'x@y.com', phone: '9876543210' }, items: [] },
    });
    assert.equal(guest.status, 401);
  });

  await t.test('login with wrong password is rejected (401, non-enumerating)', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: EMAIL, password: 'WrongPass9' } });
    assert.equal(r.status, 401);
    assert.match(r.data.error.message, /invalid email or password/i);
  });

  await t.test('login with correct password succeeds and re-issues session', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    assert.equal(r.status, 200);
    assert.ok(jar[config.authCookieName], 'auth cookie set again');
    const me = await api('GET', '/api/auth/me');
    assert.equal(me.status, 200);
  });
});
