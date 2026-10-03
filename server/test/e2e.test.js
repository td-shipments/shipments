// Test end-to-end delle API (server avviato su BASE con database vuoto, scheduler disattivato)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';

const BASE = process.env.BASE || 'http://localhost:3000';
const SUPER = { email: 'francesco.epifani@toscanadiagnostica.it', password: process.env.SUPER_PWD || 'Prova-Sicura-2026' };
const NEWPWD = 'NuovaPassword-2026';

function client() {
  let cookie = '';
  const call = async (method, url, body, raw = false) => {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + url, { method, redirect: 'manual',
      headers: { 'X-Requested-With': 'td-shipments', ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    if (raw) return res;
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    return { status: res.status, data };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b), del: (u, b) => call('DELETE', u, b), raw: (u) => call('GET', u, null, true) };
}
const S = client(); const A = client(); const V = client(); const E = client();
const ctx = { secrets: {} };

async function loginWithOnboarding(c, email, password, newPwd, needTotp) {
  let r = await c.post('/api/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (r.data.totpRequired) { r = await c.post('/api/auth/totp', { code: authenticator.generate(ctx.secrets[email]) }); assert.equal(r.status, 200); }
  if (r.data.onboarding === 'PASSWORD_CHANGE_REQUIRED') {
    assert.equal((await c.get('/api/kits')).status, 403);
    r = await c.post('/api/auth/change-password', { currentPassword: password, newPassword: newPwd });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const me = await c.get('/api/auth/me');
  if (needTotp && me.data.onboarding === 'TOTP_SETUP_REQUIRED') {
    const s = await c.post('/api/auth/totp/setup');
    ctx.secrets[email] = s.data.secret;
    r = await c.post('/api/auth/totp/enable', { code: authenticator.generate(s.data.secret) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return (await c.get('/api/auth/me')).data;
}

const EMAIL = `Hi,\nCould you kindly send the following kit\n\nAFF298672IT - Standard SDA\nMs. Andrea Green\nCAMPING LA ROCCIA, VIA MADONNA 84\nLAMPEDUSA\nAGRIGENTO\n92031\nItaly\nTEL: 00393342107111\n\nAFF298673IT - Express Return SDA\nMr. Mario Rossi\nVia Roma 1\nFirenze\nFI\n50100\nItaly\nTEL: 3331234567\n\nThanks and regards\nAdministration Department Affinity`;

test('flusso completo Shipments', async (t) => {
  await t.test('CSRF e login errato', async () => {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
    assert.equal((await S.post('/api/auth/login', { email: SUPER.email, password: 'sbagliata' })).status, 401);
  });
  await t.test('super amministratore: onboarding', async () => {
    const me = await loginWithOnboarding(S, SUPER.email, SUPER.password, NEWPWD, true);
    assert.equal(me.user.role, 'SUPERADMIN'); assert.equal(me.onboarding, null);
    assert.equal((await S.post('/api/auth/lang', { lang: 'en' })).status, 200);
    assert.equal((await S.get('/api/auth/me')).data.user.lang, 'en');
    await S.post('/api/auth/lang', { lang: 'it' });
  });
  await t.test('utenti: amministratore, amministrazione, Endeavor', async () => {
    let r = await S.post('/api/users', { email: 'operatore@toscanadiagnostica.it', full_name: 'Operatore Spedizioni', role: 'ADMIN', auth_provider: 'LOCAL' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); ctx.adminPwd = r.data.temporaryPassword;
    r = await S.post('/api/users', { email: 'amministrazione@toscanadiagnostica.it', full_name: 'Amministrazione', role: 'VIEWER', auth_provider: 'LOCAL' });
    assert.equal(r.status, 201); ctx.viewerPwd = r.data.temporaryPassword;
    r = await S.post('/api/users', { email: 'katalin@affinitydna.co.uk', full_name: 'Affinity DNA', role: 'ENDEAVOR', lang: 'en', auth_provider: 'LOCAL' });
    assert.equal(r.status, 201); ctx.endPwd = r.data.temporaryPassword;
    await loginWithOnboarding(A, 'operatore@toscanadiagnostica.it', ctx.adminPwd, NEWPWD, true);
    await loginWithOnboarding(V, 'amministrazione@toscanadiagnostica.it', ctx.viewerPwd, NEWPWD, false);
    await loginWithOnboarding(E, 'katalin@affinitydna.co.uk', ctx.endPwd, NEWPWD, false);
  });
  await t.test('tariffario: 7 modalità con i prezzi concordati', async () => {
    const r = await S.get('/api/modes');
    assert.equal(r.status, 200); assert.equal(r.data.length, 7);
    const p = Object.fromEntries(r.data.map((m) => [m.code, Number(m.price)]));
    assert.deepEqual(p, { STD_OUT: 6.8, STD_RET: 6.8, STD_OUT_STD_RET: 13.6, STD_OUT_EXP_RET: 16.7, EXP_OUT: 9.9, EXP_RET: 9.9, EXP_OUT_EXP_RET: 19.8 });
    ctx.modes = Object.fromEntries(r.data.map((m) => [m.code, m.id]));
  });
  await t.test('magazzino: carico lotto con codici a barre, duplicati rifiutati', async () => {
    let r = await A.post('/api/kits/lots', { project: 'ENDEAVOR', received_at: '2026-10-01', reference: 'DDT 1234', barcodes: ['KIT0001', 'kit0002 ', 'KIT0003', 'KIT0004'] });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.kits, 4); ctx.lot = r.data.id;
    r = await A.post('/api/kits/lots', { project: 'ENDEAVOR', received_at: '2026-10-01', barcodes: ['KIT0002'] });
    assert.equal(r.status, 400);
    r = await A.post('/api/kits/lots', { project: 'LIFESTYLE', supplier: 'Toscana Diagnostica', received_at: '2026-10-02', barcodes: ['LS0001', 'LS0002', 'LS0003'] });
    assert.equal(r.status, 201);
    r = await A.get('/api/kits/lookup/kit0001'); assert.equal(r.status, 200); assert.equal(r.data.status, 'IN_STOCK');
    r = await A.get('/api/kits/summary?project=ENDEAVOR'); assert.equal(r.data.byStatus.find((x) => x.status === 'IN_STOCK').n, 4);
    r = await A.post('/api/kits/4/discard', { reason: 'Confezione danneggiata' }); assert.equal(r.status, 200);
    assert.equal((await A.get('/api/kits/summary?project=ENDEAVOR')).data.byStatus.find((x) => x.status === 'IN_STOCK').n, 3);
    assert.equal((await V.post('/api/kits/lots', { project: 'ENDEAVOR', received_at: '2026-10-01', barcodes: ['X1'] })).status, 403, 'amministrazione sola lettura');
  });
  await t.test('posta: email Affinity incollata, letta e confermata in due richieste', async () => {
    let r = await A.post('/api/orders/inbox/paste', { text: EMAIL, subject: 'Kits to send out - AFF298672IT', from_addr: 'info@affinitydna.co.uk' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.status, 'PARSED'); assert.equal(r.data.parsed.length, 2);
    const p = r.data.parsed;
    assert.equal(p[0].external_ref, 'AFF298672IT'); assert.equal(p[0].mode.code, 'STD_OUT'); assert.equal(p[0].zip, '92031'); assert.equal(p[0].province, 'AG'); assert.equal(p[0].phone, '00393342107111');
    assert.equal(p[1].mode.code, 'EXP_RET');
    ctx.inbox = r.data.id;
    const items = p.map((x) => ({ project: 'ENDEAVOR', order_type: 'ENDEAVOR', external_ref: x.external_ref, shipping_mode_id: x.mode.id, patient_title: x.patient_title, patient_first_name: x.patient_first_name, patient_last_name: x.patient_last_name, address1: x.address1, address2: x.address2, city: x.city, province: x.province, zip: x.zip, country: x.country, phone: x.phone, lang: 'en' }));
    items[0].barcode = 'KIT0001';
    r = await A.post(`/api/orders/inbox/${ctx.inbox}/confirm`, { items });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.order_ids.length, 2);
    [ctx.o1, ctx.o2] = r.data.order_ids;
    r = await A.get(`/api/orders/${ctx.o1}`); assert.equal(r.data.status, 'ASSIGNED'); assert.equal(r.data.barcode, 'KIT0001'); assert.equal(r.data.source, 'EMAIL');
    r = await A.get(`/api/orders/${ctx.o2}`); assert.equal(r.data.status, 'NEW');
    r = await A.post(`/api/orders/inbox/${ctx.inbox}/confirm`, { items }); assert.equal(r.status, 400, 'doppia conferma rifiutata');
    assert.equal((await A.get('/api/orders/counts')).data.inbox, 0);
  });
  await t.test('assegnazione kit: controlli', async () => {
    let r = await A.post(`/api/orders/${ctx.o2}/assign`, { barcode: 'KIT0001' }); assert.equal(r.status, 400, 'kit già assegnato');
    r = await A.post(`/api/orders/${ctx.o2}/assign`, { barcode: 'LS0001' }); assert.equal(r.status, 400, 'kit di altro progetto');
    r = await A.post(`/api/orders/${ctx.o2}/assign`, { barcode: 'NONESISTE' }); assert.equal(r.status, 400);
    r = await A.post(`/api/orders/${ctx.o2}/assign`, { barcode: 'KIT0002' }); assert.equal(r.status, 200); assert.equal(r.data.status, 'ASSIGNED');
    r = await A.post(`/api/orders/${ctx.o2}/unassign`); assert.equal(r.data.status, 'NEW');
    assert.equal((await A.get('/api/kits/lookup/KIT0002')).data.status, 'IN_STOCK');
    r = await A.post(`/api/orders/${ctx.o2}/assign`, { barcode: 'KIT0002' }); assert.equal(r.status, 200);
  });
  await t.test('invio: andata standard con etichetta di ritorno, tariffa 6,80', async () => {
    let r = await A.post(`/api/orders/${ctx.o1}/ship`, {}); assert.equal(r.status, 400, 'serve la lettera di vettura');
    r = await A.post(`/api/orders/${ctx.o1}/ship`, { outbound_tracking: 'SDA123456789IT', shipped_at: '2026-10-02' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, 'SHIPPED'); assert.equal(Number(r.data.fee_shipping), 6.8); assert.equal(r.data.fee_shipping_date, '2026-10-02');
    assert.equal(r.data.shipments.length, 1); assert.equal(r.data.shipments[0].direction, 'OUTBOUND'); assert.equal(r.data.shipments[0].service, 'STANDARD');
    assert.equal((await A.get('/api/kits/lookup/KIT0001')).data.status, 'SHIPPED');
    const pdf = await A.raw(`/api/orders/${ctx.o1}/sheet.pdf?lang=en`); assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-type'), /pdf/);
    const buf = Buffer.from(await pdf.arrayBuffer()); assert.ok(buf.length > 3000); assert.equal(buf.subarray(0, 4).toString(), '%PDF');
  });
  await t.test('invio: modalità solo ritorno = consegna a mano, tariffa 9,90', async () => {
    let r = await A.post(`/api/orders/${ctx.o2}/ship`, { return_tracking: 'SDARET0001IT' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, 'DELIVERED'); assert.equal(r.data.handover, true); assert.equal(Number(r.data.fee_shipping), 9.9);
    assert.equal(r.data.shipments.length, 1); assert.equal(r.data.shipments[0].direction, 'RETURN'); assert.equal(r.data.shipments[0].tracking_number, 'SDARET0001IT');
    r = await A.post(`/api/orders/${ctx.o2}/undo`); assert.equal(r.data.status, 'ASSIGNED'); assert.equal(r.data.fee_shipping, null); assert.equal(r.data.shipments.length, 0);
    r = await A.post(`/api/orders/${ctx.o2}/ship`, { return_tracking: 'SDARET0001IT' }); assert.equal(r.data.status, 'DELIVERED');
  });
  await t.test('consegna manuale e modifica tracking', async () => {
    let r = await A.post(`/api/orders/${ctx.o1}/deliver`, { delivered_at: '2026-10-04' }); assert.equal(r.status, 200); assert.equal(r.data.status, 'DELIVERED');
    assert.equal(r.data.shipments[0].last_status, 'DELIVERED');
    r = await A.post(`/api/orders/${ctx.o1}/undo`); assert.equal(r.data.status, 'SHIPPED');
    r = await A.post(`/api/orders/${ctx.o1}/deliver`, {}); assert.equal(r.data.status, 'DELIVERED');
    const sid = r.data.shipments[0].id;
    r = await A.put(`/api/orders/${ctx.o1}/shipments/${sid}`, { tracking_number: 'SDA123456789IT' }); assert.equal(r.status, 200);
    r = await A.post(`/api/orders/${ctx.o1}/shipments/${sid}/refresh`); assert.equal(r.status, 200); assert.equal(r.data.ok, false); assert.equal(r.data.reason, 'no_provider');
  });
  await t.test('ricezione del campione per scansione del kit', async () => {
    let r = await A.post('/api/orders/sample-received', { barcode: 'KIT0003' }); assert.equal(r.status, 400, 'kit non assegnato');
    r = await A.post('/api/orders/sample-received', { barcode: 'kit0001', received_at: '2026-10-10' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, 'SAMPLE_RECEIVED');
    r = await A.post(`/api/orders/${ctx.o2}/sample-received`, { received_at: '2026-10-11' }); assert.equal(r.data.status, 'SAMPLE_RECEIVED'); assert.equal(r.data.shipments[0].last_status, 'DELIVERED');
    assert.equal((await A.get('/api/orders/counts')).data.awaitingLab, 2);
  });
  await t.test('spedizione al laboratorio: creazione, lettera di vettura, invio, tariffa campione 3,50, email', async () => {
    let r = await A.post('/api/lab', { barcodes: ['KIT0001'], order_ids: [ctx.o2], notes: 'Scatola 1' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); ctx.lab = r.data.id; assert.equal(r.data.orders.length, 2); assert.equal(r.data.status, 'PREPARING');
    assert.ok(r.data.emails.length >= 1, 'email di imminente invio registrata'); assert.equal(r.data.emails[0].status, 'NON_CONFIGURATA');
    r = await A.post(`/api/lab/${ctx.lab}/ship`, {}); assert.equal(r.status, 400, 'serve la lettera di vettura');
    r = await A.put(`/api/lab/${ctx.lab}`, { awb_number: '794644790138', awb_received_at: '2026-10-12', remove_order_ids: [ctx.o2] }); assert.equal(r.status, 200); assert.equal(r.data.orders.length, 1);
    r = await A.put(`/api/lab/${ctx.lab}`, { order_ids: [ctx.o2] }); assert.equal(r.data.orders.length, 2);
    const fd = new FormData(); fd.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'awb.pdf');
    r = await A.post(`/api/lab/${ctx.lab}/awb`, fd); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.has_awb_file, true);
    r = await A.post(`/api/lab/${ctx.lab}/ship`, { shipped_at: '2026-10-13' }); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, 'SHIPPED');
    assert.equal(r.data.shipment.carrier, 'FEDEX'); assert.equal(r.data.shipment.tracking_number, '794644790138');
    const o = (await A.get(`/api/orders/${ctx.o1}`)).data; assert.equal(o.status, 'SHIPPED_TO_LAB'); assert.equal(Number(o.fee_sample), 3.5); assert.equal(o.fee_sample_date, '2026-10-13');
    const pdf = await A.raw(`/api/lab/${ctx.lab}/sheet.pdf`); assert.equal(pdf.status, 200);
    r = await A.post(`/api/lab/${ctx.lab}/deliver`, { delivered_at: '2026-10-16' }); assert.equal(r.data.status, 'DELIVERED');
    assert.equal((await A.get(`/api/orders/${ctx.o1}`)).data.status, 'CLOSED');
    assert.equal((await A.get('/api/kits/lookup/KIT0001')).data.status, 'CLOSED');
    r = await A.post(`/api/lab/${ctx.lab}/undo`); assert.equal(r.data.status, 'SHIPPED');
    r = await A.post(`/api/lab/${ctx.lab}/deliver`, {}); assert.equal(r.data.status, 'DELIVERED');
  });
  await t.test('Lifestyle: solo kit e kit + esame', async () => {
    let r = await A.post('/api/orders', { project: 'LIFESTYLE', order_type: 'KIT_ONLY', external_ref: 'WEB-1001', patient_first_name: 'Giulia', patient_last_name: 'Bianchi', address1: 'Via Verdi 3', city: 'Prato', province: 'po', zip: '59100', email: 'giulia@example.it', barcode: 'LS0001' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); ctx.l1 = r.data.id; assert.equal(r.data.status, 'ASSIGNED'); assert.equal(r.data.province, 'PO');
    r = await A.post(`/api/orders/${ctx.l1}/ship`, { outbound_tracking: 'SDALS0001' }); assert.equal(r.data.status, 'SHIPPED'); assert.equal(r.data.fee_shipping, null); assert.equal(r.data.shipments.length, 1);
    r = await A.post(`/api/orders/${ctx.l1}/sample-received`, { site: 'Quarrata' }); assert.equal(r.data.status, 'CLOSED'); assert.equal(r.data.sample_received_site, 'Quarrata');
    r = await A.post('/api/orders', { project: 'LIFESTYLE', order_type: 'KIT_AND_EXAM', external_ref: 'WEB-1002', patient_first_name: 'Luca', patient_last_name: 'Neri', address1: 'Via Dante 9', city: 'Pistoia', zip: '51100' });
    assert.equal(r.status, 201); ctx.l2 = r.data.id;
    r = await A.post(`/api/orders/${ctx.l2}/assign`, { barcode: 'LS0002' }); assert.equal(r.status, 200);
    r = await A.post(`/api/orders/${ctx.l2}/ship`, { outbound_tracking: 'SDALS0002', return_tracking: 'SDALS0002R' }); assert.equal(r.data.status, 'SHIPPED'); assert.equal(r.data.shipments.length, 2);
    r = await A.post('/api/orders', { project: 'LIFESTYLE', order_type: 'ENDEAVOR', patient_first_name: 'X', patient_last_name: 'Y', address1: 'Via', city: 'C' }); assert.equal(r.status, 400);
  });
  await t.test('annullamento e modifica richiesta', async () => {
    let r = await A.post('/api/orders', { project: 'ENDEAVOR', order_type: 'ENDEAVOR', external_ref: 'AFF999999IT', shipping_mode_id: ctx.modes.EXP_OUT_EXP_RET, patient_first_name: 'Anna', patient_last_name: 'Verdi', address1: 'Via Pisa 2', city: 'Lucca', zip: '55100', barcode: 'KIT0003' });
    assert.equal(r.status, 201); const id = r.data.id;
    r = await A.put(`/api/orders/${id}`, { phone: '333000111', shipping_mode_id: ctx.modes.STD_OUT_EXP_RET }); assert.equal(r.status, 200); assert.equal(r.data.mode_code, 'STD_OUT_EXP_RET');
    r = await A.post('/api/orders', { project: 'ENDEAVOR', order_type: 'ENDEAVOR', external_ref: 'aff999999it', shipping_mode_id: ctx.modes.STD_OUT, patient_first_name: 'A', patient_last_name: 'B', address1: 'V', city: 'C' }); assert.equal(r.status, 400, 'riferimento duplicato');
    r = await A.post(`/api/orders/${id}/cancel`, { reason: 'Richiesta annullata dal cliente' }); assert.equal(r.data.status, 'CANCELLED');
    assert.equal((await A.get('/api/kits/lookup/KIT0003')).data.status, 'IN_STOCK');
    r = await A.post(`/api/orders/${id}/undo`); assert.equal(r.data.status, 'ASSIGNED');
    r = await A.post(`/api/orders/${id}/cancel`, { reason: 'Definitivo' }); assert.equal(r.data.status, 'CANCELLED');
  });
  await t.test('rendicontazione quantitativa e cruscotto', async () => {
    let r = await A.get('/api/reports/dashboard?project=ENDEAVOR'); assert.equal(r.status, 200); assert.equal(r.data.stock, 1); assert.ok(r.data.trend.length === 6);
    r = await A.get('/api/reports/quantitative?project=ENDEAVOR&from=2026-10-01&to=2026-10-31'); assert.equal(r.status, 200);
    const oct = r.data.perMonth.find((m) => m.month === '2026-10'); assert.equal(oct.shipped, 2); assert.equal(oct.samples, 2); assert.equal(oct.to_lab, 2); assert.equal(oct.stock_in, 4); assert.equal(oct.cancelled, 1);
    assert.equal(r.data.byMode.length, 2);
    r = await A.raw('/api/reports/orders.csv?project=ENDEAVOR&from=2026-01-01&to=2026-12-31'); assert.equal(r.status, 200); assert.match(await r.text(), /AFF298672IT/);
    r = await A.get('/api/reports/quantitative?project=LIFESTYLE'); assert.equal(r.data.bySite[0].site, 'Quarrata');
  });
  await t.test('rendiconto economico: mese ottobre 2026 = 2 spedizioni (6,80 + 9,90) + 2 campioni (3,50)', async () => {
    let r = await A.get('/api/billing?project=ENDEAVOR'); assert.equal(r.status, 200);
    const oct = r.data.find((m) => m.month === '2026-10'); assert.equal(oct.shipments, 2); assert.equal(oct.samples, 2); assert.equal(oct.totalShipping, 16.7); assert.equal(oct.totalSamples, 7); assert.equal(oct.total, 23.7);
    r = await A.get('/api/billing/2026-10?project=ENDEAVOR'); assert.equal(r.data.byMode.length, 2);
    r = await A.post('/api/billing/2026-10/close?project=ENDEAVOR'); assert.equal(r.status, 400, 'mese non concluso');
    const x = await A.raw('/api/billing/2026-10/export.xlsx?project=ENDEAVOR'); assert.equal(x.status, 200); assert.ok((await x.arrayBuffer()).byteLength > 5000);
    const p = await A.raw('/api/billing/2026-10/statement.pdf?project=ENDEAVOR&lang=en'); assert.equal(p.status, 200);
    // profilo Endeavor: vede i rendiconti, non le richieste
    r = await E.get('/api/billing?project=ENDEAVOR'); assert.equal(r.status, 200);
    r = await E.get('/api/orders'); assert.equal(r.status, 403);
    r = await E.get('/api/reports/quantitative?project=LIFESTYLE'); assert.equal(r.status, 403);
    r = await E.get('/api/reports/quantitative?project=ENDEAVOR'); assert.equal(r.status, 200);
    r = await V.get('/api/orders'); assert.equal(r.status, 200, 'amministrazione legge tutto');
    r = await V.post(`/api/orders/${ctx.o1}/undo`); assert.equal(r.status, 403);
  });
  await t.test('impostazioni e registri', async () => {
    let r = await S.get('/api/settings'); assert.equal(r.status, 200); assert.equal(r.data.settings.sample_fee, '3.50'); assert.equal(r.data.mail.configured, false);
    r = await S.put('/api/settings', { alert_return_days: '14', td_sites: 'Sesto Fiorentino, Quarrata' }); assert.equal(r.status, 200);
    r = await A.put('/api/settings', { alert_return_days: '10' }); assert.equal(r.status, 403);
    r = await S.put(`/api/modes/${ctx.modes.STD_OUT}`, { price: 6.8, email_aliases: 'standard sda|standard outbound|standard' }); assert.equal(r.status, 200);
    r = await S.post('/api/settings/run/alerts'); assert.equal(r.status, 200);
    r = await S.post('/api/settings/run/inbox'); assert.equal(r.status, 200); assert.equal(r.data.skipped, 'not_configured');
    r = await S.get('/api/email-log'); assert.ok(r.data.length >= 2);
    r = await S.get('/api/audit'); assert.ok(r.data.length > 20);
    r = await A.get(`/api/orders/${ctx.o1}`); assert.ok(r.data.events.length >= 6); assert.ok(r.data.events.some((e) => e.event === 'SHIPPED_TO_LAB'));
  });
});
