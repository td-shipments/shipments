import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, canOperate } from '../auth.jsx';
import { useT } from '../i18n.jsx';
import { Card, Modal, Field, ErrorBox, Loading, Empty, Badge, useApi, useToast } from '../components/ui.jsx';
import { OrdersTable, OrderForm, emptyOrder, useModes } from '../components/orders.jsx';
import { fdt, projectPath } from '../format.js';

export default function Inbox({ project }) {
  const { t, lang } = useT();
  const { user } = useAuth();
  const op = canOperate(user);
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState('pending');
  const [paste, setPaste] = useState(null);
  const [manual, setManual] = useState(null);
  const [review, setReview] = useState(null);
  const [err, setErr] = useState(null);
  const modes = useModes();
  const status = tab === 'pending' ? 'NEW,PARSED,ERROR' : tab === 'done' ? 'CONFIRMED' : 'IGNORED';
  const inbox = useApi(project === 'ENDEAVOR' ? `/orders/inbox?status=${status}` : null, [tab]);
  const newOrders = useApi(`/orders?project=${project}&status=NEW`, [tab]);
  const settings = useApi(op ? '/settings' : null);
  const p = projectPath(project);

  const doPaste = async () => {
    setErr(null);
    try { const r = await api.post('/orders/inbox/paste', { text: paste.text, subject: paste.subject || null }); setPaste(null); inbox.reload(); if (r.status === 'PARSED') openReview(r); else toast(t('inbox.noKits'), 'err'); } catch (e) { setErr(e); }
  };
  const openReview = (m) => {
    const items = (m.parsed || []).map((b) => ({ ...emptyOrder('ENDEAVOR'), external_ref: b.external_ref, shipping_mode_id: b.mode?.id || '', mode_text: b.mode_text, warnings: b.warnings || [], patient_title: b.patient_title || '', patient_first_name: b.patient_first_name, patient_last_name: b.patient_last_name, address1: b.address1, address2: b.address2 || '', city: b.city, province: b.province || '', zip: b.zip || '', country: b.country || 'Italia', phone: b.phone || '', lang: 'en' }));
    setReview({ msg: m, items: items.length ? items : [emptyOrder('ENDEAVOR')] });
  };
  const confirm = async () => {
    setErr(null);
    try {
      const items = review.items.map(({ mode_text, warnings, ...x }) => ({ ...x, shipping_mode_id: x.shipping_mode_id || null, email: x.email || null, barcode: x.barcode || null }));
      const r = await api.post(`/orders/inbox/${review.msg.id}/confirm`, { items });
      toast(`${t('inbox.created')}: ${r.order_ids.length}`); setReview(null); inbox.reload(); newOrders.reload();
      if (r.order_ids.length === 1) nav(`/${p}/richieste/${r.order_ids[0]}`);
    } catch (e) { setErr(e); }
  };
  const ignore = async (m) => { try { await api.post(`/orders/inbox/${m.id}/ignore`); inbox.reload(); } catch (e) { setErr(e); } };
  const reparse = async (m) => { try { const r = await api.post(`/orders/inbox/${m.id}/reparse`); openReview(r); } catch (e) { setErr(e); } };
  const createManual = async () => {
    setErr(null);
    try { const o = await api.post('/orders', { ...manual, shipping_mode_id: manual.shipping_mode_id || null, email: manual.email || null, barcode: manual.barcode || null }); toast(t('c.saved')); setManual(null); nav(`/${p}/richieste/${o.id}`); } catch (e) { setErr(e); }
  };
  const runInbox = async () => { try { const r = await api.post('/settings/run/inbox'); toast(JSON.stringify(r)); inbox.reload(); } catch (e) { setErr(e); } };
  const mailCfg = settings.data?.mail;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{t('inbox.title')}</h1><div className="sub">{project === 'ENDEAVOR' ? t('inbox.sub') : t('proj.LIFESTYLE.desc')}</div></div>
        {op && <div className="row">{project === 'ENDEAVOR' && <button className="btn ghost" onClick={() => setPaste({ text: '', subject: '' })}>{t('inbox.paste')}</button>}<button className="btn" onClick={() => setManual(emptyOrder(project))}>+ {t('inbox.manual')}</button></div>}
      </div>
      <ErrorBox error={err} />
      {project === 'ENDEAVOR' && op && settings.data && (
        <div className={`alert ${mailCfg?.inboxConfigured ? 'info' : 'warn'}`} style={{ marginBottom: 14 }}>
          {mailCfg?.inboxConfigured ? <>{t('inbox.graphOn', { m: mailCfg.inbox, n: 5, t: settings.data.inbox.lastPoll ? fdt(settings.data.inbox.lastPoll) : '–' })} <button className="btn sm ghost" onClick={runInbox}>{t('inbox.readNow')}</button></> : t('inbox.graphOff')}
        </div>
      )}
      {project === 'ENDEAVOR' && <>
        <div className="tabs">{[['pending', t('inbox.pending')], ['done', t('inbox.done')], ['ignored', t('inbox.ignored')]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {!inbox.data ? <Loading /> : !inbox.data.length ? <Card><Empty>{t('c.none')}</Empty></Card> : (
          <div className="rowlist" style={{ marginBottom: 20 }}>
            {inbox.data.map((m) => (
              <div key={m.id} className={`blockcard ${m.status === 'ERROR' || (m.parsed || []).some((b) => b.warnings?.length) ? 'warn' : ''}`}>
                <div className="hd">
                  <div><span className="strong">{m.subject || '(no subject)'}</span> <span className="small muted">· {t('inbox.from')} {m.from_addr || '–'} · {t('inbox.received')} {fdt(m.received_at)} · {t(`inbox.source.${m.source}`)}</span></div>
                  <div className="row">
                    {m.status === 'CONFIRMED' ? <span className="small">{t('inbox.created')}: {(m.order_ids || []).map((id) => <Link key={id} to={`/${p}/richieste/${id}`} className="chip">#{id}</Link>)}</span>
                      : m.status === 'IGNORED' ? <Badge>{t('inbox.ignored')}</Badge>
                        : <>{(m.parsed || []).length ? <Badge tone="blue">{(m.parsed || []).length} {t('inbox.kits')}</Badge> : <Badge tone="red">{t('inbox.noKits')}</Badge>}
                          {op && <><button className="btn sm" onClick={() => openReview(m)}>{t('inbox.review')}</button><button className="btn sm ghost" onClick={() => reparse(m)}>{t('inbox.reparse')}</button><button className="btn sm ghost" onClick={() => ignore(m)}>{t('inbox.ignore')}</button></>}</>}
                  </div>
                </div>
                {(m.parsed || []).length > 0 && m.status !== 'CONFIRMED' && <div className="row small">{m.parsed.map((b, i) => <span key={i} className="chip">{b.external_ref} · {b.patient_first_name} {b.patient_last_name} · {b.mode ? (lang === 'en' ? modes.data?.find((x) => x.id === b.mode.id)?.name_en : modes.data?.find((x) => x.id === b.mode.id)?.name_it) : <span className="red">{b.mode_text}?</span>}</span>)}</div>}
                <details style={{ marginTop: 8 }}><summary className="small muted" style={{ cursor: 'pointer' }}>{t('inbox.body')}</summary><pre className="mail">{m.body_text}</pre></details>
              </div>))}
          </div>
        )}
      </>}
      <Card title={t('dash.toAssign')} flush>
        <OrdersTable rows={newOrders.data} project={project} columns={['ref', 'patient', 'mode', 'status', 'date']} />
      </Card>

      {paste && (
        <Modal title={t('inbox.paste')} wide onClose={() => setPaste(null)} footer={<><button className="btn ghost" onClick={() => setPaste(null)}>{t('c.cancel')}</button><button className="btn" disabled={paste.text.trim().length < 10} onClick={doPaste}>{t('inbox.review')}</button></>}>
          <ErrorBox error={err} />
          <div className="small muted" style={{ marginBottom: 10 }}>{t('inbox.pasteHelp')}</div>
          <Field label={t('inbox.subject')}><input value={paste.subject} onChange={(e) => setPaste({ ...paste, subject: e.target.value })} placeholder="Kits to send out - AFF…" /></Field>
          <Field label={t('inbox.body')} className="" ><textarea rows={14} autoFocus value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} /></Field>
        </Modal>
      )}
      {manual && (
        <Modal title={t('inbox.manual')} wide onClose={() => setManual(null)} footer={<><button className="btn ghost" onClick={() => setManual(null)}>{t('c.cancel')}</button><button className="btn" disabled={!manual.patient_last_name || !manual.address1 || !manual.city || (project === 'ENDEAVOR' && !manual.shipping_mode_id)} onClick={createManual}>{t('c.save')}</button></>}>
          <ErrorBox error={err} />
          <OrderForm value={manual} onChange={setManual} project={project} modes={modes.data} />
        </Modal>
      )}
      {review && (
        <Modal title={`${t('inbox.review')} · ${review.msg.subject || ''}`} wide onClose={() => setReview(null)} footer={<><button className="btn ghost" onClick={() => setReview(null)}>{t('c.cancel')}</button><button className="btn" onClick={confirm}>{review.items.length > 1 ? t('inbox.confirmN', { n: review.items.length }) : t('inbox.confirm1')}</button></>}>
          <ErrorBox error={err} />
          <div className="rowlist">
            {review.items.map((it, i) => (
              <div key={i} className={`blockcard ${it.warnings?.length ? 'warn' : ''}`}>
                <div className="hd"><span className="ref">{it.external_ref || `#${i + 1}`}</span>
                  <div className="row small">{it.mode_text && <span className="muted">{t('inbox.modeText')}: <b>{it.mode_text}</b></span>}{(it.warnings || []).map((w) => <Badge key={w} tone="red">{t(`inbox.warn.${w}`)}</Badge>)}
                    {review.items.length > 1 && <button className="btn sm ghost" onClick={() => setReview({ ...review, items: review.items.filter((_, j) => j !== i) })}>{t('c.delete')}</button>}</div></div>
                <OrderForm value={it} onChange={(v) => setReview({ ...review, items: review.items.map((x, j) => (j === i ? v : x)) })} project="ENDEAVOR" modes={modes.data} compact />
              </div>))}
          </div>
          <details style={{ marginTop: 12 }}><summary className="small muted" style={{ cursor: 'pointer' }}>{t('inbox.body')}</summary><pre className="mail">{review.msg.body_text}</pre></details>
        </Modal>
      )}
    </div>
  );
}
