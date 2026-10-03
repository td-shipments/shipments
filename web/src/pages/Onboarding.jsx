import React from 'react';
import { useAuth } from '../auth.jsx';
import { useT, LangToggle } from '../i18n.jsx';
import { PasswordForm, TotpSetup } from './Profile.jsx';

export default function Onboarding() {
  const { onboarding, refresh, logout, user } = useAuth();
  const { t } = useT();
  return (
    <div className="login">
      <div className="art">
        <img src="/logo-light.svg" alt="Toscana Diagnostica" />
        <div className="claim" dangerouslySetInnerHTML={{ __html: t('onb.claim').replace('<b>', '<span>').replace('</b>', '</span>') }} />
        <div className="foot">{user.email}</div>
      </div>
      <div className="pane">
        <div style={{ width: 'min(400px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row" style={{ justifyContent: 'flex-end' }}><LangToggle persist /></div>
          {onboarding === 'PASSWORD_CHANGE_REQUIRED' ? <>
            <h1>{t('onb.pwd')}</h1><div className="muted">{t('onb.pwdSub')}</div>
            <PasswordForm onDone={refresh} />
          </> : <>
            <h1>{t('onb.totp')}</h1><div className="muted">{t('onb.totpSub')}</div>
            <TotpSetup onDone={refresh} />
          </>}
          <button className="btn link" onClick={logout}>{t('nav.logout')}</button>
        </div>
      </div>
    </div>
  );
}
