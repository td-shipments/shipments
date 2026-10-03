// Configurazione da variabili d'ambiente
const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  baseUrl: env.BASE_URL || 'http://localhost:3000',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres@localhost:5432/shipments',
  sessionSecret: env.SESSION_SECRET || 'dev-only-change-me',
  secureCookies: env.NODE_ENV === 'production',
  sessionHours: Number(env.SESSION_HOURS || 10),
  requireTotpForAdmins: (env.REQUIRE_TOTP_FOR_ADMINS || 'true') === 'true',
  entra: {
    tenantId: env.ENTRA_TENANT_ID || '',
    clientId: env.ENTRA_CLIENT_ID || '',
    clientSecret: env.ENTRA_CLIENT_SECRET || '',
    get enabled() { return Boolean(this.tenantId && this.clientId && this.clientSecret); },
  },
  // Casella letta (richieste in arrivo) e mittente delle comunicazioni: shipments@toscanadiagnostica.it
  graph: {
    sender: env.GRAPH_SENDER || '',
    inbox: env.GRAPH_INBOX || env.GRAPH_SENDER || '',
    pollMinutes: Number(env.GRAPH_POLL_MINUTES || 5),
  },
  tracking: {
    provider: (env.TRACKING_PROVIDER || 'none').toLowerCase(), // none | 17track | aftership
    apiKey: env.TRACKING_API_KEY || '',
    fedexClientId: env.FEDEX_CLIENT_ID || '',
    fedexClientSecret: env.FEDEX_CLIENT_SECRET || '',
    fedexBase: env.FEDEX_API_BASE || 'https://apis.fedex.com',
    pollMinutes: Number(env.TRACKING_POLL_MINUTES || 30),
  },
  seed: {
    superadminEmail: env.SEED_SUPERADMIN_EMAIL || '',
    superadminName: env.SEED_SUPERADMIN_NAME || 'Super Amministratore',
    superadminPassword: env.SEED_SUPERADMIN_PASSWORD || '',
  },
  appName: 'Toscana Diagnostica · Shipments',
};

if (env.NODE_ENV === 'production' && config.sessionSecret === 'dev-only-change-me') {
  throw new Error('SESSION_SECRET obbligatorio in produzione');
}
