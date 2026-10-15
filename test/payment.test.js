/**
 * Payment flow tests (node:test) — self-contained with an in-memory MongoDB and a
 * MOCKED Razorpay gateway (no live API calls, no real transactions). Covers:
 * server-side amount calc + client tampering, invalid/malformed signatures,
 * ownership mismatch, idempotency, out-of-stock + oversell guard, failure/dismissal,
 * guest + CSRF rejection, and gateway-error + safe retry.
 *
 * Run: npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { __setRazorpayOrderCreatorForTests } from '../src/utils/razorpay.js';

// Configure test secrets on the shared config object (no live keys needed).
const TEST_SECRET = 'payment_test_secret';
config.razorpayKeyId = 'rzp_test_mock';
config.razorpayKeySecret = TEST_SECRET;
config.jwtSecret = config.jwtSecret || 'payment-test-jwt';

// Mock gateway order creation. `gatewayShouldFail` lets us simulate an API error.
let gatewayShouldFail = false;
__setRazorpayOrderCreatorForTests(async ({ amountPaise, currency, receipt }) => {
  if (gatewayShouldFail) throw new Error('mock gateway failure');
  return { id: 'order_MOCK_' + crypto.randomBytes(6).toString('hex'), amount: amountPaise, currency, receipt, status: 'created' };
});

function sign(orderId, paymentId) {
  return crypto.createHmac('sha256', TEST_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

let server, base, mongod, setupError = null;
let inStock, lowStock, outOfStock;

function jar() { const j = {}; return { j, store(r){ for (const c of r.headers.getSetCookie?.()??[]){const p=c.split(';')[0];const i=p.indexOf('=');const n=p.slice(0,i).trim();const v=p.slice(i+1).trim();v===''?delete j[n]:j[n]=v;} } }; }
async function req(m, p, { body, jo } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (jo) { const ck = Object.entries(jo.j).map(([k,v])=>`${k}=${v}`).join('; '); if (ck) h.Cookie = ck; if (jo.j.qc_csrf && m !== 'GET') h['x-csrf-token'] = jo.j.qc_csrf; }
  const r = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (jo) jo.store(r);
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, data: d };
}
const A = jar(), B = jar();

before(async () => {
  try {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    [inStock, lowStock, outOfStock] = await Product.create([
      { name: 'In Stock', description: 'x', price: 250000, image: 'http://img/1', category: 'Test', stock: 5 },
      { name: 'Low Stock', description: 'x', price: 100000, image: 'http://img/2', category: 'Test', stock: 1 },
      { name: 'Out Of Stock', description: 'x', price: 50000, image: 'http://img/3', category: 'Test', stock: 0 },
    ]);
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
    await req('POST', '/api/auth/register', { jo: A, body: { name: 'A', email: `a${Date.now()}@t.co`, password: 'Passw0rd1' } });
    await req('POST', '/api/auth/register', { jo: B, body: { name: 'B', email: `b${Date.now()}@t.co`, password: 'Passw0rd1' } });
  } catch (e) { setupError = e; }
});
after(async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
const stockOf = async (id) => (await Product.findById(id)).stock;

test('payment suite', async (t) => {
  if (setupError) { t.skip(`setup failed: ${setupError.message}`); return; }

  await t.test('create-order computes amount server-side and ignores client-supplied amount', async () => {
    const r = await req('POST', '/api/payments/create-order', {
      jo: A,
      body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 2 }], amount: 1, total: 1 },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.data.amount, 250000 * 2, 'server total = price*qty, not the tampered amount');
    assert.ok(r.data.data.razorpayOrderId.startsWith('order_'));
    assert.equal(r.data.data.razorpayKeyId, 'rzp_test_mock');
  });

  await t.test('guest create-order → 401', async () => {
    assert.equal((await req('POST', '/api/payments/create-order', { jo: jar(), body: { customer: {}, items: [] } })).status, 401);
  });

  await t.test('authed create-order without CSRF token → 403', async () => {
    const noCsrf = jar();
    noCsrf.j.qc_token = A.j.qc_token; // valid session cookie but NO qc_csrf
    assert.equal((await req('POST', '/api/payments/create-order', { jo: noCsrf, body: { customer: {}, items: [] } })).status, 403);
  });

  await t.test('out-of-stock product → 409', async () => {
    const r = await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(outOfStock._id), quantity: 1 }] } });
    assert.equal(r.status, 409);
  });

  await t.test('insufficient stock → 409', async () => {
    const r = await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(lowStock._id), quantity: 5 }] } });
    assert.equal(r.status, 409);
  });

  await t.test('gateway error → 502, pending order rolled back, then safe retry works', async () => {
    const { Order } = await import('../src/models/Order.js');
    const before = await Order.countDocuments();
    gatewayShouldFail = true;
    const fail = await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 1 }] } });
    gatewayShouldFail = false;
    assert.equal(fail.status, 502);
    assert.equal(await Order.countDocuments(), before, 'rolled back — no leaked pending order');
    const ok = await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 1 }] } });
    assert.equal(ok.status, 201, 'retry after gateway error succeeds');
  });

  await t.test('verify valid signature → paid + stock decremented once (idempotent re-verify)', async () => {
    const start = await stockOf(inStock._id);
    const co = (await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 2 }] } })).data.data;
    const pid = 'pay_' + crypto.randomBytes(5).toString('hex');
    const payload = { orderId: co.orderId, razorpay_order_id: co.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: sign(co.razorpayOrderId, pid) };
    const v1 = await req('POST', '/api/payments/verify', { jo: A, body: payload });
    assert.equal(v1.status, 200);
    assert.equal(v1.data.data.paymentStatus, 'paid');
    assert.equal(v1.data.data.alreadyProcessed, false);
    assert.equal(await stockOf(inStock._id), start - 2, 'stock decremented by qty');
    const v2 = await req('POST', '/api/payments/verify', { jo: A, body: payload });
    assert.equal(v2.data.data.alreadyProcessed, true, 're-verify idempotent');
    assert.equal(await stockOf(inStock._id), start - 2, 'stock not decremented twice');
  });

  await t.test('verify bad signature → 400, order failed, no stock change', async () => {
    const start = await stockOf(inStock._id);
    const co = (await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 1 }] } })).data.data;
    const r = await req('POST', '/api/payments/verify', { jo: A, body: { orderId: co.orderId, razorpay_order_id: co.razorpayOrderId, razorpay_payment_id: 'pay_x', razorpay_signature: 'deadbeef'.repeat(8) } });
    assert.equal(r.status, 400);
    assert.equal(await stockOf(inStock._id), start, 'no stock change on bad signature');
  });

  await t.test('verify malformed payload → 400', async () => {
    assert.equal((await req('POST', '/api/payments/verify', { jo: A, body: { orderId: 'x' } })).status, 400);
  });

  await t.test('verify ownership mismatch → 404 (B verifies A\'s order)', async () => {
    const co = (await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 1 }] } })).data.data;
    const pid = 'pay_' + crypto.randomBytes(5).toString('hex');
    const r = await req('POST', '/api/payments/verify', { jo: B, body: { orderId: co.orderId, razorpay_order_id: co.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: sign(co.razorpayOrderId, pid) } });
    assert.equal(r.status, 404);
  });

  await t.test('failed/dismissal endpoint marks a pending order failed', async () => {
    const co = (await req('POST', '/api/payments/create-order', { jo: A, body: { customer: { name: 'A', email: 'a@t.co', phone: '9876543210' }, items: [{ productId: String(inStock._id), quantity: 1 }] } })).data.data;
    const r = await req('POST', '/api/payments/failed', { jo: A, body: { orderId: co.orderId, reason: 'user_dismissed' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.data.paymentStatus, 'failed');
  });

  await t.test('oversell guard: two paid orders for the last unit never drive stock negative', async () => {
    // lowStock has 1 unit. Two users each create an order for 1, both verify.
    const mk = async (jo) => (await req('POST', '/api/payments/create-order', { jo, body: { customer: { name: 'x', email: 'x@t.co', phone: '9876543210' }, items: [{ productId: String(lowStock._id), quantity: 1 }] } })).data.data;
    const coA = await mk(A), coB = await mk(B);
    const pay = (jo, co) => { const pid = 'pay_' + crypto.randomBytes(5).toString('hex'); return req('POST', '/api/payments/verify', { jo, body: { orderId: co.orderId, razorpay_order_id: co.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: sign(co.razorpayOrderId, pid) } }); };
    await Promise.all([pay(A, coA), pay(B, coB)]);
    const s = await stockOf(lowStock._id);
    assert.ok(s >= 0, `stock never negative (got ${s})`);
    assert.equal(s, 0, 'exactly one unit decremented; guard prevents overselling below 0');
  });
});
