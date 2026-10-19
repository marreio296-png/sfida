# Mappa del progetto Sfida

## Flusso dei dati

```mermaid
flowchart LR
    browser["Browser: index.html + script.js"]
    admin["Browser: admin.html + admin.js"]
    config["firebase-config.js"]
    adminIdentity["firebase-admin.js<br/>email amministratore"]
    auth["Firebase Authentication<br/>anonimo per partecipanti, password per admin"]
    app["Firebase JavaScript SDK: App + Auth + Firestore"]
    profiles["Firestore: profiles/{id}<br/>nome + foto + ownerUid"]
    people["Firestore: people/{id}<br/>approcci + ownerUid"]
    rules["firestore.rules<br/>profili condivisi + admin"]
    pages["GitHub Pages<br/>file statici"]
    node["server.js (opzionale)<br/>API locali legacy"]
    json["data/store.json"]

    pages --> browser
    pages --> admin
    config --> browser
    config --> admin
    adminIdentity --> browser
    adminIdentity --> admin
    browser --> auth
    admin --> auth
    browser --> app
    admin --> app
    auth --> app
    app --> profiles
    app --> people
    rules -. autorizza .-> profiles
    rules -. autorizza .-> people
    node --> json
    browser -. solo senza config Firebase .-> node
```

## File principali

| File | Responsabilità |
|---|---|
| `index.html`, `style.css` | Interfaccia pubblica e layout |
| `script.js` | Profili, foto, approcci, modifiche, sincronizzazione Firestore e classifica |
| `firebase-config.js` | Identificativi pubblici dell'app Firebase |
| `firebase-admin.js` | Email dell'account admin usata dal client; non contiene password |
| `firestore.rules` | Autorizzazioni e validazione documenti Firestore |
| `admin.html`, `admin.css`, `admin.js` | Login admin, consultazione live, cancellazione singola e cancellazione in blocco dei documenti Firestore |
| `server.js` | Server Node e API legacy locali |
| `data/store.json` | Archivio delle API legacy locali, non di Firestore |
| `README.md` | Configurazione, autorizzazioni e pubblicazione |

## Accessi e autorizzazioni

I partecipanti accedono con Firebase Authentication anonima. Tutti gli utenti autenticati possono vedere e selezionare i profili condivisi; il browser ricorda localmente l'ultimo profilo scelto e lo riapre automaticamente. Senza PIN o credenziali, chiunque può selezionare qualsiasi profilo. Gli approcci registrano l'UID di chi li ha creati, così ogni partecipante può modificare solo i propri; le cancellazioni sono riservate all'account password `marreio296@gmail.com`.

Le foto sono salvate nei documenti profilo come stringhe data URL; non è configurato Firebase Storage. La password non è presente nei file del progetto. Pubblicare `firestore.rules` sul repository non aggiorna le regole attive: vanno pubblicate anche dalla Console Firebase.

Nell'area admin, i comandi di cancellazione in blocco eliminano gli approcci oppure tutti i profili e gli approcci in Firestore. Le operazioni richiedono conferma e non eliminano gli account Firebase Authentication.
