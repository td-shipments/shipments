import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT, LangToggle } from '../i18n.jsx';
import { Field, ErrorBox, Card, useToast } from '../components/ui.jsx';

export function PasswordForm({ onDone }) {
  const { t } = useT();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    if (f.newPassword !== f.confirm) return setErr(new Error(t('prof.mismatch')));
    setBusy(true);
    try { await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }); onDone?.(); } catch (e2) { setErr(e2); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={err} />
      <Field label={t('prof.current')}><input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required /></Field>
      <Field label={t('prof.newPwd')} help={t('prof.pwdHelp')}><input type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required /></Field>
      <Field label={t('prof.repeat')}><input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
      <button className="btn" disabled={busy}>{t('prof.savePwd')}</button>
    </form>
  );
}

export function TotpSetup({ onDone }) {
  const { t } = useT();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const start = async () => { setErr(null); try { setSetup(await api.post('/auth/totp/setup')); } catch (e) { setErr(e); } };
  const enable = async (e) => { e.preventDefault(); setErr(null); try { await api.post('/auth/totp/enable', { code }); onDone?.(); } catch (e2) { setErr(e2); } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={err} />
      {!setup ? <button className="btn" onClick={start}>{t('prof.qr')}</button> : (
        <form onSubmit={enable} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <img src={setup.qr} alt="QR code" width={200} height={200} style={{ border: '1px solid var(--line)', borderRadius: 10 }} />
          <div className="small muted">{t('prof.manual')}: <span className="mono">{setup.secret}</span></div>
          <Field label={t('prof.code6')}><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus style={{ fontSize: 20, letterSpacing: '.3em', textAlign: 'center', width: 200 }} /></Field>
          <button className="btn">{t('prof.activate')}</button>
        </form>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, authMethod, refresh } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const local = user.auth_provider !== 'ENTRA';
  return (
    <div className="page">
      <div className="page-head"><div><h1>{t('prof.title')}</h1><div className="sub">{user.full_name} · {user.email} · {t(`role.${user.role}`)}</div></div></div>
      <div className="grid g2">
        <Card title={t('prof.access')}>
          <p>{t('prof.method')}: <b>{authMethod === 'ENTRA' ? 'Microsoft 365' : t('usr.auth.LOCAL')}</b></p>
          <p>{t('prof.2fa')}: <b>{user.totp_enabled ? t('prof.on') : t('prof.off')}</b></p>
          {authMethod === 'ENTRA' && <p className="muted small">{t('prof.msNote')}</p>}
          <p className="row">{t('prof.lang')}: <LangToggle persist /></p>
        </Card>
        {local && <Card title={t('prof.changePwd')}><PasswordForm onDone={() => toast(t('prof.pwdOk'))} /></Card>}
        {local && !user.totp_enabled && <Card title={t('prof.enable2fa')}><TotpSetup onDone={() => { toast(t('prof.2faOk')); refresh(); }} /></Card>}
      </div>
    </div>
  );
}
