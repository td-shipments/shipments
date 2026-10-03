import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, canOperate, isSuper, isEndeavor } from './auth.jsx';
import { LangProvider, useT, LangToggle } from './i18n.jsx';
import { ToastProvider, Icon, Loading, useApi, BusyBar } from './components/ui.jsx';
import { projectOf } from './format.js';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Stock from './pages/Stock.jsx';
import Shipping from './pages/Shipping.jsx';
import Returns from './pages/Returns.jsx';
import Lab from './pages/Lab.jsx';
import Quantitative from './pages/Quantitative.jsx';
import Billing from './pages/Billing.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Audit from './pages/Audit.jsx';
import Emails from './pages/Emails.jsx';
import Profile from './pages/Profile.jsx';

function ProjectShell({ proj }) {
  const { user, logout } = useAuth();
  const { t } = useT();
  const project = projectOf(proj);
  const base = `/${proj}`;
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const endeavorOnly = isEndeavor(user);
  const counts = useApi(endeavorOnly ? null : `/orders/counts?project=${project}`, [loc.pathname]);
  const inboxN = project === 'ENDEAVOR' ? counts.data?.inbox || 0 : 0;
  const awaitingN = project === 'ENDEAVOR' ? counts.data?.awaitingLab || 0 : 0;
  const toAssign = (counts.data?.byStatus || []).filter((x) => x.status === 'NEW').reduce((a, x) => a + x.n, 0);
  const op = canOperate(user);
  const sup = isSuper(user);
  const L = ({ to, icon, children, count, end }) => (
    <NavLink to={to} end={end}><Icon name={icon} />{children}{count ? <span className="count">{count}</span> : null}</NavLink>
  );
  if (endeavorOnly && project !== 'ENDEAVOR') return <Navigate to="/endeavor/rendiconto" replace />;
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><img src="/logo-light.svg" alt="Toscana Diagnostica" /><div className="app">{t('app')}</div></div>
        <div className={`proj ${project === 'LIFESTYLE' ? 'ls' : ''}`}><Icon name={project === 'LIFESTYLE' ? 'heart' : 'dna'} />{t(`proj.${project}`)}</div>
        <nav>
          {endeavorOnly ? <>
            <div className="group">{t('nav.reports')}</div>
            <L to={`${base}/rendicontazione`} icon="chart">{t('nav.qty')}</L>
            <L to={`${base}/rendiconto`} icon="euro">{t('nav.billing')}</L>
          </> : <>
            <L to={base} icon="home" end>{t('nav.dashboard')}</L>
            <div className="group">{t('nav.process')}</div>
            <L to={`${base}/richieste`} icon="inbox" count={project === 'ENDEAVOR' ? inboxN + toAssign : toAssign}>{t('nav.inbox')}</L>
            <L to={`${base}/magazzino`} icon="box">{t('nav.stock')}</L>
            {project === 'ENDEAVOR' ? <L to={`${base}/invio`} icon="send">{t('nav.ship')}</L> : <>
              <L to={`${base}/invio`} icon="send">{t('nav.shipKit')}</L>
              <L to={`${base}/invio-esame`} icon="flask">{t('nav.shipKitExam')}</L>
            </>}
            <L to={`${base}/ricezione`} icon="scan">{t('nav.returns')}</L>
            {project === 'ENDEAVOR' && <L to={`${base}/laboratorio`} icon="plane" count={awaitingN}>{t('nav.lab')}</L>}
            <L to={`${base}/elenco`} icon="list">{t('nav.orders')}</L>
            <div className="group">{t('nav.reports')}</div>
            <L to={`${base}/rendicontazione`} icon="chart">{t('nav.qty')}</L>
            {project === 'ENDEAVOR' && <L to={`${base}/rendiconto`} icon="euro">{t('nav.billing')}</L>}
            {op && <>
              <div className="group">{t('nav.system')}</div>
              <L to={`${base}/utenti`} icon="users">{t('nav.users')}</L>
              <L to={`${base}/impostazioni`} icon="gear">{t('nav.settings')}</L>
              <L to={`${base}/email`} icon="mail">{t('nav.emails')}</L>
              <L to={`${base}/audit`} icon="shield">{t('nav.audit')}</L>
            </>}
            {!op && user.role === 'VIEWER' && <>
              <div className="group">{t('nav.system')}</div>
              <L to={`${base}/email`} icon="mail">{t('nav.emails')}</L>
              <L to={`${base}/audit`} icon="shield">{t('nav.audit')}</L>
            </>}
            <div className="group" />
            <L to="/" icon="swap" end>{t('nav.switch')}</L>
          </>}
        </nav>
        <div className="me">
          <div className="name">{user.full_name}</div>
          <div>{t(`role.${user.role}`)}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <NavLink to={`${base}/profilo`} className="btn sm ghost" style={{ color: 'var(--teal)' }}>{t('nav.profile')}</NavLink>
            <button className="btn sm dark" onClick={logout}>{t('nav.logout')}</button>
            <LangToggle dark />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar"><button onClick={() => setOpen(!open)} aria-label="Menu">☰</button><img src="/logo-light.svg" alt="" /></div>
        <Routes>
          {endeavorOnly ? <>
            <Route path="rendicontazione" element={<Quantitative project={project} />} />
            <Route path="rendiconto" element={<Billing project={project} />} />
            <Route path="profilo" element={<Profile />} />
            <Route path="*" element={<Navigate to={`${base}/rendiconto`} replace />} />
          </> : <>
            <Route index element={<Dashboard project={project} />} />
            <Route path="richieste" element={<Inbox project={project} />} />
            <Route path="richieste/:id" element={<OrderDetail project={project} />} />
            <Route path="magazzino" element={<Stock project={project} />} />
            <Route path="invio" element={<Shipping project={project} orderType={project === 'LIFESTYLE' ? 'KIT_ONLY' : null} />} />
            {project === 'LIFESTYLE' && <Route path="invio-esame" element={<Shipping project={project} orderType="KIT_AND_EXAM" />} />}
            <Route path="ricezione" element={<Returns project={project} />} />
            {project === 'ENDEAVOR' && <Route path="laboratorio" element={<Lab project={project} />} />}
            {project === 'ENDEAVOR' && <Route path="laboratorio/:id" element={<Lab project={project} />} />}
            <Route path="elenco" element={<Orders project={project} />} />
            <Route path="rendicontazione" element={<Quantitative project={project} />} />
            {project === 'ENDEAVOR' && <Route path="rendiconto" element={<Billing project={project} />} />}
            {op && <Route path="utenti" element={<Users />} />}
            {op && <Route path="impostazioni" element={<Settings />} />}
            {(op || user.role === 'VIEWER') && <Route path="audit" element={<Audit />} />}
            {(op || user.role === 'VIEWER') && <Route path="email" element={<Emails />} />}
            <Route path="profilo" element={<Profile />} />
            <Route path="*" element={<Navigate to={base} replace />} />
          </>}
        </Routes>
      </main>
    </div>
  );
}

function Gate() {
  const { loading, user, onboarding } = useAuth();
  const { setLang } = useT();
  useEffect(() => { if (user?.lang) setLang(user.lang, false); }, [user?.lang, setLang]);
  if (loading) return <Loading />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (onboarding) return <Onboarding />;
  return (
    <Routes>
      <Route path="/" element={isEndeavor(user) ? <Navigate to="/endeavor/rendiconto" replace /> : <Home />} />
      <Route path="/endeavor/*" element={<ProjectShell proj="endeavor" />} />
      <Route path="/lifestyle/*" element={<ProjectShell proj="lifestyle" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LangProvider>
      <ToastProvider>
        <BusyBar />
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </LangProvider>
  );
}
