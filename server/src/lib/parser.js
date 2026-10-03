// Lettura delle email "Kits to send out" di Affinity / Endeavor DNA.
// Formato atteso (un blocco per kit):
//   AFF298672IT - Standard SDA
//   Ms. Andrea Green
//   CAMPING LA ROCCIA, VIA MADONNA 84
//   LAMPEDUSA
//   AGRIGENTO
//   92031
//   Italy
//   TEL: 00393342107111
// Il parser è tollerante: ogni campo non riconosciuto resta vuoto e l'operatore lo completa prima della conferma.

const REF_LINE = /^\s*([A-Z]{2,6}\d{4,}[A-Z]{0,4})\s*[-–:]\s*(.+?)\s*$/i;
const TITLE_RE = /^(mr|mrs|ms|miss|dr|sig|sig\.ra|sig\.na|sigra|dott|dott\.ssa|prof)\.?\s+/i;
const PHONE_RE = /^(tel|phone|telefono|mobile|cell)\.?\s*[:.]?\s*(.+)$/i;
const ZIP_RE = /^\d{5}$/;
const COUNTRIES = ['italy', 'italia', 'san marino', 'vatican', 'vaticano', 'switzerland', 'svizzera', 'france', 'francia', 'germany', 'germania', 'spain', 'spagna', 'austria', 'slovenia', 'malta', 'united kingdom', 'uk'];

export function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Riconosce la modalità di spedizione dalla frase dell'email usando gli alias configurati nel tariffario
export function matchMode(text, modes) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  let best = null;
  for (const m of modes) {
    for (const alias of String(m.email_aliases || '').split('|').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      if (t === alias || t.includes(alias)) {
        if (!best || alias.length > best.len) best = { id: m.id, code: m.code, len: alias.length, exact: t === alias };
      }
    }
  }
  return best ? { id: best.id, code: best.code, exact: best.exact } : null;
}

export function parseKitEmail(text, modes = []) {
  const lines = htmlToText(text).split('\n').map((l) => l.trim());
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(REF_LINE);
    if (m) { cur = { ref: m[1].toUpperCase(), modeText: m[2].trim(), lines: [] }; blocks.push(cur); continue; }
    if (!cur) continue;
    if (!line) { if (cur.lines.length) cur.closed = true; continue; }
    if (cur.closed) continue;
    if (/^(thanks|regards|kind regards|best regards|administration|cordiali|grazie)/i.test(line)) { cur.closed = true; continue; }
    cur.lines.push(line);
  }
  return blocks.map((b) => {
    const r = { external_ref: b.ref, mode_text: b.modeText, mode: matchMode(b.modeText, modes), patient_title: null, patient_first_name: '', patient_last_name: '', address1: '', address2: null, city: '', province: null, zip: null, country: 'Italia', phone: null, warnings: [] };
    const rest = [];
    for (const l of b.lines) {
      const p = l.match(PHONE_RE);
      if (p) { r.phone = p[2].replace(/[^\d+]/g, ''); continue; }
      rest.push(l);
    }
    // 1a riga: nome
    if (rest.length) {
      let name = rest.shift();
      const t = name.match(TITLE_RE);
      if (t) { r.patient_title = t[1].replace(/\.$/, ''); name = name.replace(TITLE_RE, ''); }
      const parts = name.trim().split(/\s+/);
      r.patient_first_name = parts.shift() || '';
      r.patient_last_name = parts.join(' ');
      if (!r.patient_last_name) { r.patient_last_name = r.patient_first_name; r.patient_first_name = ''; r.warnings.push('name'); }
    }
    // ultima riga paese, poi CAP, poi provincia, poi città; il resto è indirizzo
    if (rest.length && COUNTRIES.includes(rest[rest.length - 1].toLowerCase())) {
      const c = rest.pop().toLowerCase();
      r.country = (c === 'italy' || c === 'italia') ? 'Italia' : rest.length ? capitalize(c) : 'Italia';
    }
    const zipIdx = rest.findIndex((l) => ZIP_RE.test(l));
    if (zipIdx >= 0) { r.zip = rest[zipIdx]; rest.splice(zipIdx, 1); }
    else { const z = rest.join(' ').match(/\b(\d{5})\b/); if (z) r.zip = z[1]; }
    if (rest.length >= 3) { r.province = provinceOf(rest.pop()); r.city = rest.pop(); }
    else if (rest.length === 2) { r.city = rest.pop(); }
    r.address1 = rest.shift() || '';
    if (rest.length) r.address2 = rest.join(', ');
    if (!r.address1) r.warnings.push('address');
    if (!r.city) r.warnings.push('city');
    if (!r.mode) r.warnings.push('mode');
    return r;
  });
}

const PROVINCES = { agrigento: 'AG', alessandria: 'AL', ancona: 'AN', aosta: 'AO', arezzo: 'AR', 'ascoli piceno': 'AP', asti: 'AT', avellino: 'AV', bari: 'BA', 'barletta-andria-trani': 'BT', belluno: 'BL', benevento: 'BN', bergamo: 'BG', biella: 'BI', bologna: 'BO', bolzano: 'BZ', brescia: 'BS', brindisi: 'BR', cagliari: 'CA', caltanissetta: 'CL', campobasso: 'CB', caserta: 'CE', catania: 'CT', catanzaro: 'CZ', chieti: 'CH', como: 'CO', cosenza: 'CS', cremona: 'CR', crotone: 'KR', cuneo: 'CN', enna: 'EN', fermo: 'FM', ferrara: 'FE', firenze: 'FI', foggia: 'FG', 'forli-cesena': 'FC', 'forlì-cesena': 'FC', frosinone: 'FR', genova: 'GE', gorizia: 'GO', grosseto: 'GR', imperia: 'IM', isernia: 'IS', 'la spezia': 'SP', "l'aquila": 'AQ', latina: 'LT', lecce: 'LE', lecco: 'LC', livorno: 'LI', lodi: 'LO', lucca: 'LU', macerata: 'MC', mantova: 'MN', 'massa-carrara': 'MS', 'massa carrara': 'MS', matera: 'MT', messina: 'ME', milano: 'MI', modena: 'MO', 'monza e brianza': 'MB', 'monza e della brianza': 'MB', napoli: 'NA', novara: 'NO', nuoro: 'NU', oristano: 'OR', padova: 'PD', palermo: 'PA', parma: 'PR', pavia: 'PV', perugia: 'PG', 'pesaro e urbino': 'PU', pescara: 'PE', piacenza: 'PC', pisa: 'PI', pistoia: 'PT', pordenone: 'PN', potenza: 'PZ', prato: 'PO', ragusa: 'RG', ravenna: 'RA', 'reggio calabria': 'RC', 'reggio emilia': 'RE', rieti: 'RI', rimini: 'RN', roma: 'RM', rovigo: 'RO', salerno: 'SA', sassari: 'SS', savona: 'SV', siena: 'SI', siracusa: 'SR', sondrio: 'SO', 'sud sardegna': 'SU', taranto: 'TA', teramo: 'TE', terni: 'TR', torino: 'TO', trapani: 'TP', trento: 'TN', treviso: 'TV', trieste: 'TS', udine: 'UD', varese: 'VA', venezia: 'VE', 'verbano-cusio-ossola': 'VB', vercelli: 'VC', verona: 'VR', 'vibo valentia': 'VV', vicenza: 'VI', viterbo: 'VT' };
export function provinceOf(s) {
  const t = String(s || '').trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return PROVINCES[t.toLowerCase()] || t;
}
const capitalize = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
