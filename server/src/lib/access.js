import { one } from '../db.js';
import { config } from '../config.js';
import { forbidden, HttpError } from './util.js';

// Costruttore di parametri posizionali per query dinamiche
export class Params {
  constructor() { this.values = []; }
  add(v) { this.values.push(v); return `$${this.values.length}`; }
}

export async function loadUser(req, _res, next) {
  try {
    const id = req.session?.userId;
    if (id) {
      const u = await one(
        `SELECT id, email, full_name, role, lang, auth_provider, must_change_password, totp_enabled, active FROM users WHERE id = $1`, [id]);
      if (u && u.active) req.user = u; else req.session.userId = null;
    }
    // lingua della richiesta: utente, poi header
    req.lang = req.user?.lang || ((req.get('accept-language') || '').toLowerCase().startsWith('en') ? 'en' : 'it');
    next();
  } catch (e) { next(e); }
}

const ONBOARDING_PATHS = ['/api/auth/me', '/api/auth/logout', '/api/auth/change-password', '/api/auth/totp/setup', '/api/auth/totp/enable', '/api/auth/lang'];

export function onboardingState(req) {
  const u = req.user;
  if (!u) return null;
  const local = req.session.authMethod === 'LOCAL';
  if (local && u.must_change_password) return 'PASSWORD_CHANGE_REQUIRED';
  if (local && config.requireTotpForAdmins && ['ADMIN', 'SUPERADMIN'].includes(u.role) && !u.totp_enabled) return 'TOTP_SETUP_REQUIRED';
  return null;
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, req.lang === 'en' ? 'Session expired or not authenticated' : 'Sessione scaduta o non autenticata'));
  const st = onboardingState(req);
  if (st && !ONBOARDING_PATHS.includes(req.originalUrl.split('?')[0])) {
    const e = new HttpError(403, st === 'PASSWORD_CHANGE_REQUIRED' ? 'Cambio password obbligatorio' : 'Attivazione verifica in due passaggi obbligatoria');
    e.code = st;
    return next(e);
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden());

export const isSuper = (u) => u?.role === 'SUPERADMIN';
// chi opera sul processo (magazzino, richieste, spedizioni, campioni, rendiconti)
export const canOperate = (u) => ['SUPERADMIN', 'ADMIN'].includes(u?.role);
export const OPERATORS = ['SUPERADMIN', 'ADMIN'];

// Profili in sola lettura: VIEWER (Amministrazione) vede tutto in lettura; ENDEAVOR vede solo rendiconti del progetto Endeavor
const ENDEAVOR_ALLOWED = [/^\/api\/auth\//, /^\/api\/reports\//, /^\/api\/billing/, /^\/api\/modes$/, /^\/api\/settings\/public$/];
export function readOnlyGuard(req, _res, next) {
  const role = req.user?.role;
  if (!role || canOperate(req.user)) return next();
  const path = req.originalUrl.split('?')[0];
  if (req.method !== 'GET' && !path.startsWith('/api/auth/')) return next(forbidden(req.lang === 'en' ? 'Read-only profile' : 'Profilo in sola lettura'));
  if (role === 'ENDEAVOR') {
    if (!ENDEAVOR_ALLOWED.some((re) => re.test(path))) return next(forbidden(req.lang === 'en' ? 'Section not available for this profile' : 'Sezione non disponibile per questo profilo'));
    if (req.query.project && req.query.project !== 'ENDEAVOR') return next(forbidden());
    req.query.project = 'ENDEAVOR';
  }
  next();
}
