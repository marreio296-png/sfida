# Sfida del club

Il sito gestisce l'interfaccia, i profili attivi sul dispositivo, il diario e la classifica. Firebase Firestore è usato solo per conservare e sincronizzare i documenti `profiles` (nome e foto) e `people` (approcci). Le foto sono memorizzate nei documenti del profilo; non è configurato Firebase Storage.

Per una mappa dei flussi, dei file e delle raccolte, consulta [MAPPA.md](./MAPPA.md).

## Dati e accesso

Il sito usa Firebase Authentication con accesso anonimo per i partecipanti e password per l'account amministratore `marreio296@gmail.com`. L'area admin può inviare a questa casella il link Firebase per impostare o reimpostare la password. Non inserire la password nel codice o in questo repository.

I partecipanti possono leggere tutti i profili condivisi e scegliere un profilo da qualsiasi browser. Il browser ricorda l'ultimo profilo scelto e lo riapre automaticamente agli accessi successivi; su un browser nuovo basta selezionarlo una volta. Senza PIN o credenziali, però, non è possibile verificare l'identità di chi seleziona un profilo: chiunque può usare qualsiasi profilo e registrare approcci a suo nome. Ogni partecipante può modificare i propri approcci, mentre soltanto l'amministratore può cancellare profili e approcci. Le autorizzazioni sono applicate dalle regole Firestore, non soltanto dall'interfaccia.

I profili esistenti senza `ownerUid` restano visibili e selezionabili, ma non possono essere modificati dai partecipanti; gli approcci già presenti restano leggibili e possono essere rimossi dall'amministratore.

## Configurare Firestore

1. Crea o seleziona un progetto Firebase e attiva Cloud Firestore.
2. In `firebase-config.js`, inserisci la configurazione dell'app Web. Questi identificativi sono pubblici e non sono password o chiavi di servizio.
3. In **Authentication → Sign-in method**, abilita i provider **Anonimo** ed **Email/password**.
4. Crea o verifica l'utente amministratore `marreio296@gmail.com`. Dalla pagina `admin.html` si può inviare a questa casella il link per impostare o reimpostare la password; non va salvata nei file del progetto.
5. In **Authentication → Settings → Authorized domains**, aggiungi il dominio GitHub Pages effettivamente usato dal sito.
6. Copia il contenuto di `firestore.rules` nella scheda **Regole** di Firestore e pubblicalo. Questa operazione va fatta nella console Firebase; pubblicare il file su GitHub non aggiorna automaticamente le regole del progetto.

Le regole permettono agli utenti autenticati di leggere i documenti condivisi e aggiungere approcci a qualsiasi profilo esistente; ogni utente può modificare solo gli approcci creati dal proprio UID. La creazione dei profili resta associata all'UID che li ha creati e le cancellazioni sono riservate all'email amministrativa configurata. `settings` e le altre raccolte non sono autorizzate. Non creare altri account con provider Email/password: gli utenti anonimi dei partecipanti sono creati automaticamente.

## Pubblicare con GitHub Pages

Il workflow `.github/workflows/deploy-sfida-pages.yml` pubblica il sito al push sul branch `main`.

1. Verifica che `firebase-config.js` contenga la configurazione Web corretta.
2. Verifica provider e account amministratore in Firebase Authentication.
3. Pubblica manualmente le regole Firestore come descritto sopra prima di pubblicare il nuovo client.
4. Pubblica i file aggiornati sul branch `main` e verifica che il workflow GitHub Actions termini correttamente.
5. Prova creazione profilo, foto, inserimento e modifica di un approccio, accesso admin, cancellazioni e sincronizzazione da un altro dispositivo.

La pagina `admin.html` richiede l'accesso Firebase dell'amministratore prima di mostrare i dati e le azioni di eliminazione. Oltre alla cancellazione dei singoli record, offre comandi separati per eliminare tutti gli approcci o tutti i profili e gli approcci Firestore; entrambe le azioni chiedono conferma e non eliminano gli account Firebase Authentication.

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
