# Sfida del club

Il sito gestisce l'interfaccia, i profili attivi sul dispositivo, il diario e la classifica. Firebase Firestore è usato solo per conservare e sincronizzare i documenti `profiles` (nome e foto) e `people` (approcci). Le foto sono memorizzate nei documenti del profilo; non è configurato Firebase Storage.

Per una mappa dei flussi, dei file e delle raccolte, consulta [MAPPA.md](./MAPPA.md).

## Dati e accesso

Il sito usa Firebase Authentication con accesso anonimo per i partecipanti e password per l'account amministratore `emanuele.admin@sfida-554ff.firebaseapp.com`. Non inserire la password nel codice o in questo repository.

I partecipanti possono leggere i documenti condivisi, creare il proprio profilo e aggiungere o modificare i propri approcci. Soltanto l'account amministratore può cancellare profili e approcci. Le autorizzazioni sono applicate dalle regole Firestore, non soltanto dall'interfaccia.

I profili esistenti senza `ownerUid` non possono essere assegnati automaticamente a un account anonimo. Dopo l'attivazione delle nuove regole, i partecipanti dovranno ricreare quei profili; gli approcci già presenti restano leggibili e possono essere rimossi dall'amministratore.

## Configurare Firestore

1. Crea o seleziona un progetto Firebase e attiva Cloud Firestore.
2. In `firebase-config.js`, inserisci la configurazione dell'app Web. Questi identificativi sono pubblici e non sono password o chiavi di servizio.
3. In **Authentication → Sign-in method**, abilita i provider **Anonimo** ed **Email/password**.
4. Crea o verifica l'utente amministratore `emanuele.admin@sfida-554ff.firebaseapp.com`. La password si imposta o reimposta dalla Console Firebase e non va salvata nei file del progetto.
5. In **Authentication → Settings → Authorized domains**, aggiungi il dominio GitHub Pages effettivamente usato dal sito.
6. Copia il contenuto di `firestore.rules` nella scheda **Regole** di Firestore e pubblicalo. Questa operazione va fatta nella console Firebase; pubblicare il file su GitHub non aggiorna automaticamente le regole del progetto.

Le regole permettono la lettura a utenti autenticati, vincolano creazione e modifica all'UID proprietario e riservano le cancellazioni all'email amministrativa configurata. `settings` e le altre raccolte non sono autorizzate. Non creare altri account con provider Email/password: gli utenti anonimi dei partecipanti sono creati automaticamente.

## Pubblicare con GitHub Pages

Il workflow `.github/workflows/deploy-sfida-pages.yml` pubblica il sito al push sul branch `main`.

1. Verifica che `firebase-config.js` contenga la configurazione Web corretta.
2. Verifica provider e account amministratore in Firebase Authentication.
3. Pubblica manualmente le regole Firestore come descritto sopra prima di pubblicare il nuovo client.
4. Pubblica i file aggiornati sul branch `main` e verifica che il workflow GitHub Actions termini correttamente.
5. Prova creazione profilo, foto, inserimento e modifica di un approccio, accesso admin, cancellazioni e sincronizzazione da un altro dispositivo.

La pagina `admin.html` richiede l'accesso Firebase dell'amministratore prima di mostrare i dati e le azioni di eliminazione.

## Server Node locale

Per avviare la versione locale:

```powershell
npm start
```

Il server locale conserva i dati legacy in `data/store.json`. Se `firebase-config.js` è configurato, il browser usa Firestore; altrimenti il sito servito da Node usa le API locali. Le API legacy non applicano i ruoli Firebase e non sono adatte a essere esposte su Internet.

Per rendere il server raggiungibile nella rete locale:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3001"
npm start
```

Non esporre il server locale a Internet: le API non hanno autenticazione o autorizzazioni amministrative.
