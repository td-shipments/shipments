# Toscana Diagnostica · Shipments

Webapp per la gestione, il controllo e la rendicontazione delle spedizioni dell'Area e-commerce. Destinata a shipments.toscanadiagnostica.it. Interfaccia in italiano e inglese (scelta per utente).

## Cosa fa

Due progetti, scelti all'accesso, con lo stesso motore: ogni kit è identificato dal codice a barre e percorre un ciclo unico, dal magazzino alla chiusura.

Progetto Endeavor DNA. Carico a magazzino dei kit ricevuti da Endeavor (lotto per consegna, un codice a barre per kit, scansione o incolla elenco). Lettura delle email "Kits to send out" di Affinity dalla casella shipments@ (Microsoft Graph) oppure incollate a mano: l'app riconosce riferimento, modalità di spedizione, nome, indirizzo, telefono, anche con più kit nella stessa email; l'operatore controlla e conferma. Assegnazione del kit per scansione (rifiuta kit non disponibili o di altro progetto). Invio: registrazione della lettera di vettura SDA di andata e dell'etichetta di ritorno precompilata, foglio di spedizione PDF (indirizzo, codice a barre, tratte, istruzioni per il paziente, checklist); per le modalità senza andata il kit si registra come consegnato a mano. Consegna da tracciamento o manuale. Ricezione del campione per scansione del kit. Spedizione al laboratorio: coda dei campioni in attesa, spedizione FedEx con una o più provette, lettera di vettura ricevuta da Endeavor (numero e file), packing list PDF, email automatiche in inglese ad Affinity/Endeavor alla preparazione e alla partenza. Rendicontazione quantitativa (volumi per fase e per mese, per modalità, tempi medi, situazione aperta, export CSV) e rendicontazione economica mensile (tariffa per modalità, 3,50 € per campione spedito in America, chiusura del mese con righe congelate, registrazione del numero di fattura, Excel e PDF per il gestionale di fatturazione).

Progetto Lifestyle. Richieste "solo kit" e "kit + esame" (dall'e-commerce, oggi inserite a mano o da email incollata, domani da webhook). Stesso ciclo: kit, invio SDA con etichetta di ritorno verso Via di Pratignone 13/4, tracciamento, ricezione del campione (anche consegnato in uno dei centri), rendicontazione quantitativa. Nessuna rendicontazione economica.

Trasversale. Cruscotto per progetto con lavoro da fare e allarmi (campioni non rientrati dopo N giorni, lettere di vettura mancanti, scorte sotto soglia, anomalie di tracciamento); controllo giornaliero automatico via email agli amministratori e sollecito ad Affinity per le lettere di vettura; notifica facoltativa al paziente alla spedizione; cronologia completa per richiesta e per kit; annullamento di ogni passaggio con tracciatura; registro attività e registro email; pseudonimizzazione automatica dei dati del paziente dopo il periodo di conservazione (default 12 mesi dalla chiusura).

Profili: Super amministratore (tutto, tariffario, impostazioni); Amministratore (tutto il processo); Amministrazione (sola lettura su tutto); Endeavor DNA (sola lettura della rendicontazione quantitativa ed economica del progetto Endeavor, interfaccia in inglese). Accesso con Microsoft 365 (Entra ID) o con email e password; verifica in due passaggi obbligatoria per gli amministratori con password.

## Architettura

- server/: Node.js 22, Express, PostgreSQL 16. API REST con sessioni su database, protezione CSRF, rate limit sul login, audit log. PDF con pdfkit, codici a barre Code128 con bwip-js, Excel con exceljs. Lavori periodici: lettura casella, tracciamento, allarmi, conservazione.
- web/: React 18, Vite, Recharts. Palette aziendale, responsive, scansione codici a barre con fotocamera (BarcodeDetector) o lettore USB.
- Docker: immagine unica (build del frontend più server). render.yaml per Render.

## Pubblicazione su Render (account GitHub e Render nuovi)

1. GitHub: repository privato `shipments`, caricare tutto il contenuto di questa cartella (compresi .gitignore, Dockerfile, render.yaml; non caricare node_modules né .env).
2. Render: New > Blueprint > collegare il repository. Il file render.yaml crea database (basic-256mb, Francoforte) e applicazione (starter, Francoforte). Nel pannello inserire SEED_SUPERADMIN_PASSWORD (min 12 caratteri). Dopo pochi minuti l'app risponde su https://td-shipments.onrender.com.
3. Dominio: Render > Settings > Custom Domains > shipments.toscanadiagnostica.it; sul DNS un record CNAME `shipments` verso td-shipments.onrender.com. Certificato HTTPS automatico. Ogni richiesta arrivata su un altro host viene reindirizzata al dominio ufficiale (BASE_URL).
4. Primo accesso con l'email del super amministratore e la password seed: cambio password e attivazione della verifica in due passaggi.

Piano indicativo: circa 7 $/mese web più 6 $/mese database (verificare i listini correnti). Il piano gratuito non va bene: l'app dormirebbe e i lavori periodici (casella, tracciamento, allarmi) non girerebbero.

## Microsoft 365: accesso, invio email, lettura della casella

Una sola registrazione app in Entra ID serve per le tre cose. Occorre un Global Administrator del tenant.

Accesso (login con account Office 365):

1. Microsoft Entra ID > App registrations > New registration: nome "TD Shipments", account solo di questa organizzazione (single tenant), piattaforma Web, redirect URI `https://shipments.toscanadiagnostica.it/api/auth/entra/callback` (aggiungere anche `https://td-shipments.onrender.com/api/auth/entra/callback` finché il dominio non è attivo).
2. Certificates & secrets > New client secret (24 mesi): copiare subito il valore.
3. Token configuration > Add optional claim > ID token > `email`.
4. Overview: copiare Directory (tenant) ID e Application (client) ID.
5. Render > Environment: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`; `BASE_URL` uguale all'indirizzo pubblico. Riavviare.
6. Ogni utente va censito nell'app (Utenti) con la stessa email dell'account Office 365 e metodo "Microsoft 365" o "Microsoft 365 o password". Gli esterni (Endeavor DNA) usano email e password.

Invio email dalla casella shipments@toscanadiagnostica.it e lettura delle email in arrivo:

1. Creare la casella condivisa o l'utente shipments@toscanadiagnostica.it in Microsoft 365. Far inoltrare (o inviare direttamente da Affinity) le email "Kits to send out" a questa casella: oggi arrivano a info@, basta una regola di inoltro.
2. Nella stessa registrazione app: API permissions > Add a permission > Microsoft Graph > Application permissions > `Mail.Send` e `Mail.Read` > Grant admin consent.
3. Limitare l'app alla sola casella (PowerShell Exchange Online):
   `New-DistributionGroup -Name "TD Shipments Casella" -Type Security -Members shipments@toscanadiagnostica.it`
   `New-ApplicationAccessPolicy -AppId <client id> -PolicyScopeGroupId "TD Shipments Casella" -AccessRight RestrictAccess -Description "TD Shipments: solo casella shipments"`
   `Test-ApplicationAccessPolicy -Identity shipments@toscanadiagnostica.it -AppId <client id>` deve rispondere AccessCheckResult: Granted.
4. Variabili `GRAPH_SENDER` e `GRAPH_INBOX` = shipments@toscanadiagnostica.it (già nel render.yaml). La casella viene letta ogni 5 minuti (GRAPH_POLL_MINUTES): le email che contengono "kit" o arrivano dai domini configurati in Impostazioni (affinitydna.co.uk, easydna.com) entrano in "Richieste in arrivo" già lette; le altre vengono ignorate.
5. Verifica: Impostazioni > "Invia una email di prova" e "Leggi casella ora". L'esito di ogni invio è nel Registro email.

Finché Microsoft 365 non è configurato, le email si incollano a mano in "Richieste in arrivo" e le comunicazioni in uscita restano registrate ma non partono.

## Tracciamento automatico

Senza configurazione il tracciamento è manuale (l'operatore registra consegna e ricezione; i link SDA e FedEx aprono le pagine pubbliche).

SDA (Poste Italiane): la pagina pubblica non si legge in modo affidabile da un programma. Due strade: le API di Poste Delivery Business, quando l'account sarà attivo (integrazione da fare in una release successiva, insieme alla stampa delle etichette), oppure un aggregatore. L'app prevede già 17TRACK (`TRACKING_PROVIDER=17track`, `TRACKING_API_KEY`) e AfterShip (`TRACKING_PROVIDER=aftership`): i tracciati delle loro API vanno verificati sulla documentazione del fornitore al momento dell'attivazione, con una spedizione reale.

FedEx: API Track ufficiale con account sviluppatore FedEx (`FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`); in alternativa anche FedEx passa dall'aggregatore.

Ogni 30 minuti (TRACKING_POLL_MINUTES) l'app aggiorna le spedizioni aperte; la consegna al paziente e la consegna al laboratorio avanzano in automatico lo stato della richiesta. "Aggiorna tracciamento" sulla singola spedizione forza la lettura.

## Tariffario (Endeavor DNA)

Standard in andata 6,80; Standard in ritorno 6,80; Standard in andata e ritorno 13,60; Standard in andata e Express in ritorno 16,70; Express in andata 9,90; Express in ritorno 9,90; Express in andata e ritorno 19,80. Campione spedito in America 3,50. Tutto modificabile da Impostazioni (super amministratore); il prezzo si congela sulla richiesta al momento dell'invio. Gli alias di ogni modalità servono al riconoscimento del testo nelle email: vanno completati con le diciture reali usate da Affinity.

La competenza della spedizione è la data di consegna al corriere (o di consegna a mano); quella del campione è la data di partenza FedEx. Il mese si chiude da "Rendicontazione economica" quando è concluso; le righe restano congelate e la chiusura si può riaprire solo dal super amministratore finché non è registrata la fattura.

## Sviluppo locale e test

```bash
# database
docker run -d --name shipdb -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=shipments postgres:16-alpine
# server
cd server && npm install
DATABASE_URL=postgres://postgres:dev@localhost:5432/shipments SEED_SUPERADMIN_EMAIL=tu@esempio.it SEED_SUPERADMIN_PASSWORD=Prova-Sicura-2026 DISABLE_SCHEDULER=true npm start
# frontend (proxy su :3000)
cd web && npm install && npm run dev
# test end-to-end delle API (server avviato su database vuoto)
cd server && npm test
```

## Struttura delle API

Tutte sotto /api, autenticazione via cookie di sessione, header `X-Requested-With: td-shipments` obbligatorio sulle richieste che modificano dati.

- auth: login, totp, logout, me, lang, change-password, totp/setup, totp/enable, entra/login, entra/callback
- users, modes (tariffario), kit-types, settings, settings/public, settings/test-email, settings/run/:job (inbox | tracking | alerts), email-log, audit
- kits: elenco, lookup/:barcode, summary, lots (carico), lots/:id/kits, :id (rettifica), :id/discard, :id/restore, :id/events
- orders: elenco con filtri, counts, :id, creazione, modifica, assign, unassign, ship, deliver, sample-received (per id o per barcode), cancel, undo, shipments/:sid (tracking), shipments/:sid/refresh, sheet.pdf; inbox (elenco, paste, reparse, ignore, confirm)
- lab: elenco, :id, creazione, modifica (kit, lettera di vettura), awb (upload/download), ship, deliver, undo, delete, refresh, notify, sheet.pdf
- reports: dashboard, quantitative, orders.csv
- billing: mesi, :month, close, reopen, invoice, export.xlsx, statement.pdf

## Dati personali

L'app tratta nome, indirizzo e telefono di persone che eseguono un test genetico. Il server e il database sono in regione Francoforte; accessi tracciati nel registro attività; dati del paziente pseudonimizzati in automatico dopo il periodo di conservazione impostato (default 12 mesi dalla chiusura della richiesta), testo delle email incluso. Prima del go-live: registro dei trattamenti e qualifica di Toscana Diagnostica rispetto ad Affinity/Endeavor (responsabile o titolare autonomo) da definire con il DPO.
