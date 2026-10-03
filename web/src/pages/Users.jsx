import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth, isSuper } from '../auth.jsx';
import { useT } from '../i18n.jsx';
import { useApi, Field, Loading, ErrorBox, Empty, Badge, Modal, useToast } from '../components/ui.jsx';
import { fdt } from '../format.js';

const empty = { email: '', full_name: '', role: 'ADMIN', lang: 'it', auth_provider: 'BOTH', active: true };
export default function Users() {
  const { user } = useAuth();
  const { t } = useT();
  const sup = isSuper(user);
  const toast = useToast();
  const { data, reload } = useApi('/users');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const [cred, setCred] = useState(null);
  const save = async () => {
    setErr(null);
    const b = { email: edit.email, full_name: edit.full_name, role: edit.role, lang: edit.lang, auth_provider: edit.auth_provider, active: edit.active };
    try { const r = edit.id ? await api.put(`/users/${edit.id}`, b) : await api.post('/users', b); toast(t('c.saved')); setEdit(null); reload(); if (r.temporaryPassword) setCred({ email: b.email, pwd: r.temporaryPassword }); } catch (e) { setErr(e); }
  };
  const reset = async (u, what) => {
    if (!window.confirm(what === 'pwd' ? t('usr.confirmReset', { e: u.email }) : t('usr.confirm2fa', { e: u.email }))) return;
    try { const r = await api.post(`/users/${u.id}/${what === 'pwd' ? 'reset-password' : 'reset-totp'}`); if (r.temporaryPassword) setCred({ email: u.email, pwd: r.temporaryPassword }); else toast(t('c.saved')); reload(); } catch (e) { setErr(e); }
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>{t('usr.title')}</h1><div className="sub">{t('usr.sub')}</div></div><button className="btn" onClick={() => setEdit({ ...empty })}>+ {t('usr.new')}</button></div>
      <ErrorBox error={err} />
      <div className="alert info" style={{ marginBottom: 14 }}>{t('role.ADMIN')}: {t('role.help.ADMIN')} {t('role.VIEWER')}: {t('role.help.VIEWER')} {t('role.ENDEAVOR')}: {t('role.help.ENDEAVOR')}</div>
      {!data ? <Loading /> : !data.length ? <div className="card"><Empty>{t('c.none')}</Empty></div> : (
        <div className="card"><div className="table-wrap"><table className="t">
          <thead><tr><th>{t('c.name')}</th><th>{t('c.email')}</th><th>{t('usr.role')}</th><th>{t('c.lang')}</th><th>{t('usr.auth')}</th><th>{t('usr.last')}</th><th>{t('c.status')}</th><th /></tr></thead>
          <tbody>{data.map((u) => (
            <tr key={u.id}>
              <td className="strong">{u.full_name}</td><td>{u.email}</td><td>{t(`role.${u.role}`)}</td><td>{u.lang.toUpperCase()}</td>
              <td className="small">{t(`usr.auth.${u.auth_provider}`)}{u.auth_provider !== 'ENTRA' && <div>{u.totp_enabled ? <Badge tone="green">{t('usr.2faOn')}</Badge> : <Badge>{t('usr.2faOff')}</Badge>} {u.must_change_password && <Badge tone="mauve">{t('usr.tempPwd')}</Badge>}</div>}</td>
              <td className="small muted">{u.last_login_at ? fdt(u.last_login_at) : t('usr.never')}{u.locked_until && new Date(u.locked_until) > new Date() && <div className="red">{t('usr.locked')}</div>}</td>
              <td>{u.active ? <Badge tone="green">{t('c.active')}</Badge> : <Badge tone="red">{t('c.inactive')}</Badge>}</td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm ghost" onClick={() => setEdit({ ...u })}>{t('c.edit')}</button>
                {u.auth_provider !== 'ENTRA' && <>{' '}<button className="btn sm ghost" onClick={() => reset(u, 'pwd')}>{t('usr.resetPwd')}</button></>}
                {u.totp_enabled && <>{' '}<button className="btn sm ghost" onClick={() => reset(u, 'totp')}>{t('usr.reset2fa')}</button></>}
              </td>
            </tr>))}</tbody>
        </table></div></div>
      )}
      {edit && (
        <Modal title={edit.id ? `${t('c.edit')} ${edit.full_name}` : t('usr.new')} onClose={() => setEdit(null)} footer={<><button className="btn ghost" onClick={() => setEdit(null)}>{t('c.cancel')}</button><button className="btn" disabled={!edit.email || !edit.full_name} onClick={save}>{t('c.save')}</button></>}>
          <ErrorBox error={err} />
          <div className="form-grid">
            <Field label={t('c.name')}><input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label={t('c.email')} help={t('usr.emailHelp')}><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label={t('usr.role')}><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{sup && <option value="SUPERADMIN">{t('role.SUPERADMIN')}</option>}<option value="ADMIN">{t('role.ADMIN')}</option><option value="VIEWER">{t('role.VIEWER')}</option><option value="ENDEAVOR">{t('role.ENDEAVOR')}</option></select>{t(`role.help.${edit.role}`) !== `role.help.${edit.role}` && <span className="help">{t(`role.help.${edit.role}`)}</span>}</Field>
            <Field label={t('c.lang')}><select value={edit.lang} onChange={(e) => setEdit({ ...edit, lang: e.target.value })}><option value="it">Italiano</option><option value="en">English</option></select></Field>
            <Field label={t('usr.auth')}><select value={edit.auth_provider} onChange={(e) => setEdit({ ...edit, auth_provider: e.target.value })}>{['LOCAL', 'ENTRA', 'BOTH'].map((k) => <option key={k} value={k}>{t(`usr.auth.${k}`)}</option>)}</select></Field>
          </div>
          {edit.id && <label className="f inline" style={{ marginTop: 12 }}><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />{t('c.active')}</label>}
          {!edit.id && edit.auth_provider !== 'ENTRA' && <div className="small muted" style={{ marginTop: 12 }}>{t('usr.createNote')}</div>}
        </Modal>
      )}
      {cred && (
        <Modal title={t('usr.tempTitle')} onClose={() => setCred(null)} footer={<button className="btn" onClick={() => setCred(null)}>{t('usr.copied')}</button>}>
          <p>{t('usr.tempText', { e: cred.email })}</p>
          <div className="mono" style={{ fontSize: 22, padding: 14, background: 'var(--silk)', borderRadius: 10, textAlign: 'center', userSelect: 'all' }}>{cred.pwd}</div>
        </Modal>
      )}
    </div>
  );
}
