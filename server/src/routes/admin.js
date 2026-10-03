import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, many, q, tx } from '../db.js';
import { ah, bad, badL, forbidden, notFound, audit, parse, L } from '../lib/util.js';
import { requireRole, isSuper, Params } from '../lib/access.js';
import { mailStatus, sendMail, emailLog } from '../lib/mailer.js';
import { trackingStatus } from '../lib/tracking.js';
import { pollInbox, runDailyAlerts } from '../lib/jobs.js';
import { pollTracking } from '../lib/tracking.js';

const r = Router();
const opt = (s) => s.optional().nullable().transform((v) => (v === '' ? null : v));

// ---------------- Utenti ----------------
const tempPassword = () => {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (const b of crypto.randomBytes(14)) s += alpha[b % alpha.length];
  return s.slice(0, 4) + '-' + s.slice(4, 9) + '-' + s.slice(9) + '7a';
};
const ROLES = ['SUPERADMIN', 'ADMIN', 'VIEWER', 'ENDEAVOR'];
const userSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  full_name: z.string().min(2).max(120),
  role: z.enum(ROLES),
  lang: z.enum(['it', 'en']).default('it'),
  auth_provider: z.enum(['LOCAL', 'ENTRA', 'BOTH']),
  active: z.boolean().default(true),
});

r.get('/users', requireRole('SUPERADMIN', 'ADMIN'), ah(async (_req, res) => {
  res.json(await many(`SELECT id, email, full_name, role, lang, auth_provider, totp_enabled, active, must_change_password, last_login_at, locked_until FROM users ORDER BY active DESC, full_name`));
}));

r.post('/users', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const d = parse(userSchema, req.body);
  if (d.role === 'SUPERADMIN' && !isSuper(req.user)) throw forbidden(L(req, 'Solo il super amministratore può creare super amministratori', 'Only the super administrator can create super administrators'));
  if (await one('SELECT 1 FROM users WHERE lower(email)=$1', [d.email])) throw badL(req, 'Email già registrata', 'Email already registered');
  const needsPwd = d.auth_provider !== 'ENTRA';
  const pwd = needsPwd ? tempPassword() : null;
  const row = await one(`INSERT INTO users (email, full_name, role, lang, auth_provider, password_hash, must_change_password, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [d.email, d.full_name, d.role, d.lang, d.auth_provider, pwd ? await bcrypt.hash(pwd, 12) : null, needsPwd, d.active]);
  await audit(req, 'USER_CREATE', 'user', row.id, { ...d });
  res.status(201).json({ id: row.id, temporaryPassword: pwd });
}));

r.put('/users/:id', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!existing) throw notFound();
  const d = parse(userSchema, req.body);
  if (!isSuper(req.user) && (existing.role === 'SUPERADMIN' || d.role === 'SUPERADMIN')) throw forbidden();
  if (id === req.user.id && (!d.active || d.role !== existing.role)) throw badL(req, 'Non puoi disattivare o cambiare ruolo al tuo utente', 'You cannot deactivate or change the role of your own user');
  if (await one('SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2', [d.email, id])) throw badL(req, 'Email già registrata', 'Email already registered');
  let pwd = null;
  await tx(async (c) => {
    if (d.auth_provider !== 'ENTRA' && !existing.password_hash) {
      pwd = tempPassword();
      await c.query('UPDATE users SET password_hash=$2, must_change_password=TRUE WHERE id=$1', [id, await bcrypt.hash(pwd, 12)]);
    }
    await c.query(`UPDATE users SET email=$2, full_name=$3, role=$4, lang=$5, auth_provider=$6, active=$7, updated_at=now() WHERE id=$1`, [id, d.email, d.full_name, d.role, d.lang, d.auth_provider, d.active]);
    if (!d.active) await c.query(`DELETE FROM "session" WHERE (sess->>'userId')::int = $1`, [id]);
  });
  await audit(req, 'USER_UPDATE', 'user', id, d);
  res.json({ ok: true, temporaryPassword: pwd });
}));

async function manageable(req, id) {
  const u = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw notFound();
  if (!isSuper(req.user) && u.role === 'SUPERADMIN') throw forbidden();
  return u;
}
r.post('/users/:id/reset-password', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const u = await manageable(req, Number(req.params.id));
  if (u.auth_provider === 'ENTRA') throw badL(req, "L'utente accede solo con Microsoft: la password si gestisce in Office 365", 'This user signs in with Microsoft only: the password is managed in Office 365');
  const pwd = tempPassword();
  await q('UPDATE users SET password_hash=$2, must_change_password=TRUE, failed_logins=0, locked_until=NULL WHERE id=$1', [u.id, await bcrypt.hash(pwd, 12)]);
  await q(`DELETE FROM "session" WHERE (sess->>'userId')::int = $1`, [u.id]);
  await audit(req, 'USER_RESET_PASSWORD', 'user', u.id);
  res.json({ temporaryPassword: pwd });
}));
r.post('/users/:id/reset-totp', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const u = await manageable(req, Number(req.params.id));
  await q('UPDATE users SET totp_secret=NULL, totp_enabled=FALSE WHERE id=$1', [u.id]);
  await audit(req, 'USER_RESET_TOTP', 'user', u.id);
  res.json({ ok: true });
}));

// ---------------- Tariffario / modalità di spedizione ----------------
r.get('/modes', ah(async (req, res) => {
  const all = req.query.all === '1';
  res.json(await many(`SELECT * FROM shipping_modes ${all ? '' : 'WHERE active'} ORDER BY project, sort, id`));
}));
const modeSchema = z.object({
  project: z.enum(['ENDEAVOR', 'LIFESTYLE']).default('ENDEAVOR'),
  code: z.string().regex(/^[A-Z0-9_]{2,30}$/),
  name_it: z.string().min(2).max(120),
  name_en: z.string().min(2).max(120),
  outbound_service: opt(z.enum(['STANDARD', 'EXPRESS'])),
  return_service: opt(z.enum(['STANDARD', 'EXPRESS'])),
  price: z.number().min(0).max(10000),
  email_aliases: opt(z.string().max(500)),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});
r.post('/modes', requireRole('SUPERADMIN'), ah(async (req, res) => {
  const d = parse(modeSchema, req.body);
  if (!d.outbound_service && !d.return_service) throw badL(req, 'Indica almeno una tratta', 'Select at least one leg');
  const row = await one(`INSERT INTO shipping_modes (project, code, name_it, name_en, outbound_service, return_service, price, email_aliases, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.project, d.code, d.name_it, d.name_en, d.outbound_service, d.return_service, d.price, d.email_aliases, d.active, d.sort]);
  await audit(req, 'MODE_CREATE', 'mode', row.id, d);
  res.status(201).json(row);
}));
r.put('/modes/:id', requireRole('SUPERADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(modeSchema.partial(), req.body);
  const cols = Object.keys(d);
  if (!cols.length) return res.json({ ok: true });
  await q(`UPDATE shipping_modes SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE id=$1`, [id, ...cols.map((c) => d[c])]);
  await audit(req, 'MODE_UPDATE', 'mode', id, d);
  res.json(await one('SELECT * FROM shipping_modes WHERE id=$1', [id]));
}));

// ---------------- Tipi di kit ----------------
r.get('/kit-types', ah(async (_req, res) => res.json(await many('SELECT * FROM kit_types ORDER BY active DESC, name'))));
r.post('/kit-types', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
  const row = await one('INSERT INTO kit_types (name) VALUES ($1) RETURNING *', [name]);
  await audit(req, 'KIT_TYPE_CREATE', 'kit_type', row.id, { name });
  res.status(201).json(row);
}));
r.put('/kit-types/:id', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const d = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), active: z.boolean().optional() }), req.body);
  const cols = Object.keys(d);
  if (cols.length) await q(`UPDATE kit_types SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE id=$1`, [Number(req.params.id), ...cols.map((c) => d[c])]);
  res.json({ ok: true });
}));

// ---------------- Impostazioni ----------------
const SETTING_KEYS = ['sample_fee', 'billing_customer', 'billing_customer_address', 'affinity_notify_emails', 'affinity_sender_filter', 'lab_consignee', 'return_address', 'td_sites', 'alert_return_days', 'alert_awb_days', 'alert_stock_min', 'notify_patient_on_ship', 'notify_admins_email', 'retention_months', 'inbox_enabled'];
const PUBLIC_KEYS = ['td_sites', 'return_address', 'lab_consignee', 'sample_fee', 'billing_customer'];
r.get('/settings/public', ah(async (_req, res) => {
  const rows = await many('SELECT key, value FROM app_settings WHERE key = ANY($1)', [PUBLIC_KEYS]);
  res.json(Object.fromEntries(rows.map((x) => [x.key, x.value])));
}));
r.get('/settings', requireRole('SUPERADMIN', 'ADMIN'), ah(async (_req, res) => {
  const rows = await many('SELECT key, value FROM app_settings');
  const s = Object.fromEntries(rows.map((x) => [x.key, x.value]));
  res.json({ settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, s[k] ?? ''])), mail: mailStatus(), tracking: trackingStatus(),
    inbox: { lastPoll: s.inbox_last_poll || null, since: s.inbox_since || null }, alerts: { lastRun: s.alerts_last_run || null } });
}));
r.put('/settings', requireRole('SUPERADMIN'), ah(async (req, res) => {
  const d = parse(z.record(z.string(), z.string().max(4000)), req.body);
  for (const [k, v] of Object.entries(d)) {
    if (!SETTING_KEYS.includes(k)) throw bad(`Chiave non ammessa: ${k}`);
    await q(`INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [k, v]);
  }
  await audit(req, 'SETTINGS_UPDATE', 'settings', null, d);
  res.json({ ok: true });
}));
r.post('/settings/test-email', requireRole('SUPERADMIN'), ah(async (req, res) => {
  const { to } = parse(z.object({ to: z.string().email() }), req.body);
  res.json(await sendMail({ kind: 'TEST', to, subject: 'Shipments · email di prova', title: 'Email di prova', body: 'Se leggi questo messaggio la configurazione di invio è corretta.', sentBy: req.user.id }));
}));
r.post('/settings/run/:job', requireRole('SUPERADMIN', 'ADMIN'), ah(async (req, res) => {
  const job = req.params.job;
  let out;
  if (job === 'inbox') out = await pollInbox({ force: true });
  else if (job === 'tracking') out = await pollTracking();
  else if (job === 'alerts') out = await runDailyAlerts({ force: true });
  else throw notFound();
  await audit(req, 'JOB_RUN', 'job', job, out);
  res.json(out || { ok: true });
}));
r.get('/email-log', requireRole('SUPERADMIN', 'ADMIN', 'VIEWER'), ah(async (_req, res) => res.json(await emailLog())));

// ---------------- Registro attività ----------------
r.get('/audit', requireRole('SUPERADMIN', 'ADMIN', 'VIEWER'), ah(async (req, res) => {
  const P = new Params();
  const where = ['TRUE'];
  if (req.query.user_id) where.push(`a.user_id = ${P.add(Number(req.query.user_id))}`);
  if (req.query.q) where.push(`(a.action ILIKE ${P.add('%' + req.query.q + '%')} OR a.entity_id ILIKE ${P.add('%' + req.query.q + '%')})`);
  res.json(await many(`SELECT a.*, u.full_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE ${where.join(' AND ')} ORDER BY a.at DESC LIMIT 500`, P.values));
}));

export default r;
