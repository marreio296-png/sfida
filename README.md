# Sfida del club

Il sito gestisce l'interfaccia, i profili attivi sul dispositivo, il diario e la classifica. Firebase Firestore è usato solo per conservare e sincronizzare i documenti `profiles` (nome e foto) e `people` (approcci). Le foto sono memorizzate nei documenti del profilo; non è configurato Firebase Storage.

Per una mappa dei flussi, dei file e delle raccolte, consulta [MAPPA.md](./MAPPA.md).

## Dati e accesso

Il sito non usa Firebase Authentication. Le regole Firestore permettono a chiunque di leggere, creare, modificare ed eliminare profili e approcci. Anche la pagina `admin.html` è pubblica: è un’interfaccia di gestione, non un accesso amministrativo protetto. I controlli dell’interfaccia non impediscono richieste dirette al database.

Non inserire informazioni personali o sensibili. Chiunque può alterare o cancellare i dati, inviare contenuti arbitrari e consumare la quota del progetto. Non usare questo progetto se servono ruoli, accesso riservato o modifiche protette per autore: per ottenere quelle garanzie serve un backend autenticato.

## Configurare Firestore

1. Crea o seleziona un progetto Firebase e attiva Cloud Firestore.
2. In `firebase-config.js`, inserisci la configurazione dell'app Web. Questi identificativi sono pubblici e non sono password o chiavi di servizio.
3. Copia il contenuto di `firestore.rules` nella scheda **Regole** di Firestore e pubblicalo. Questa operazione va fatta nella console Firebase; pubblicare il file su GitHub non aggiorna automaticamente le regole del progetto.
4. Non occorre abilitare Firebase Authentication né creare un utente amministratore.

Le regole lasciano accessibili soltanto `profiles` e `people`; la raccolta `settings` e le altre raccolte non sono autorizzate. La validazione dei campi è effettuata dall'app, non dalle regole, perciò richieste dirette possono inviare dati diversi.

## Pubblicare con GitHub Pages

Il workflow `.github/workflows/deploy-sfida-pages.yml` pubblica il sito al push sul branch `main`.

1. Verifica che `firebase-config.js` contenga la configurazione Web corretta.
2. Pubblica manualmente le regole Firestore come descritto sopra.
3. Pubblica i file aggiornati sul branch `main` e verifica che il workflow GitHub Actions termini correttamente.
4. Prova creazione profilo, foto, inserimento di un approccio, classifica e sincronizzazione da un altro dispositivo.

La pagina `admin.html` mostra i documenti salvati e consente le eliminazioni per comodità. Non richiede password e chiunque può eseguire le stesse operazioni direttamente su Firestore.

## Server Node locale

Per avviare la versione locale:

```powershell
npm start
```

Il server locale conserva i dati legacy in `data/store.json`. Se `firebase-config.js` è configurato, il browser continua a usare Firestore; altrimenti il sito servito da Node usa le API locali. Le API legacy non applicano ruoli amministrativi e non supportano tutte le operazioni disponibili con Firestore.

Per rendere il server raggiungibile nella rete locale:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3001"
npm start
```

Non esporre il server locale a Internet: le API non hanno autenticazione.
