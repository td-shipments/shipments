import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT, LangToggle } from '../i18n.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const { t } = useT();
  const [cfg, setCfg] = useState({ entraEnabled: false });
  const [step, setStep] = useState('pwd');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(() => { const e = new URLSearchParams(window.location.search).get('error'); return e ? new Error(e) : null; });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/config').then(setCfg).catch(() => {}); }, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (step === 'pwd') { const r = await api.post('/auth/login', { email, password }); if (r.totpRequired) { setStep('totp'); setBusy(false); return; } }
      else await api.post('/auth/totp', { code });
      window.history.replaceState(null, '', '/');
      await refresh();
    } catch (e2) { setErr(e2); }
    setBusy(false);
  };
  return (
    <div className="login">
      <div className="art">
        <img src="/logo-light.svg" alt="Toscana Diagnostica" />
        <div className="claim" dangerouslySetInnerHTML={{ __html: t('login.claim').replace('<b>', '<span>').replace('</b>', '</span>') }} />
        <div className="foot">{t('login.foot')}</div>
      </div>
      <div className="pane">
        <form onSubmit={submit}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><h1>{step === 'pwd' ? t('login.title') : t('login.totp')}</h1><div className="muted" style={{ marginTop: 4 }}>{step === 'pwd' ? t('login.sub') : t('login.totpSub')}</div></div>
            <LangToggle persist={false} />
          </div>
          <ErrorBox error={err} />
          {step === 'pwd' && cfg.entraEnabled && <>
            <a className="btn ms lg" href="/api/auth/entra/login">
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
              {t('login.ms')}
            </a>
            <div className="or">{t('login.or')}</div>
          </>}
          {step === 'pwd' ? <>
            <Field label={t('c.email')}><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <Field label={t('login.password')}><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          </> : (
            <Field label={t('login.code')}><input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} /></Field>
          )}
          <button className="btn lg" disabled={busy}>{busy ? t('login.verifying') : step === 'pwd' ? t('login.title') : t('c.confirm')}</button>
          {step === 'totp' && <button type="button" className="btn link" onClick={() => { setStep('pwd'); setCode(''); }}>{t('login.back')}</button>}
        </form>
      </div>
    </div>
  );
}
