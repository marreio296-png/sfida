# Sfida del club

`package.json` serve per il comando `npm start`; i dati e il token per le API legacy vengono creati in `data/` e non vanno condivisi.

L'istogramma nella classifica mostra i primi tre partecipanti; con più di tre, **Vedi tutto** apre il grafico completo di riusciti e pali.

## Avvio del server locale

Il server locale serve la pagina a chiunque raggiunga il suo indirizzo. Il backend API continua a richiedere il token d'invito. Avvialo sul PC che ospita la gara:

```powershell
npm start
```

### Accesso dalla rete locale

Per affiancare la sfida a un altro servizio già attivo sulla porta 3000, copia questa cartella sul PC che ospiterà la gara (ad esempio `192.168.1.150`), apri PowerShell in questa cartella e avvia:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3001"
npm start
```

Apri `http://192.168.1.150:3001` dagli altri dispositivi: la pagina non richiede un link d'invito. Se Windows Firewall lo richiede, consenti Node.js sulla rete privata per la porta 3001. Non inoltrare questa porta su Internet.

Al primo avvio crea un token casuale di 256 bit per proteggere le API del backend legacy. Il backend locale non supporta l'eliminazione di profili o approcci né le modifiche individuali, perché non ha identità amministrative individuali. Con Firebase configurato, profili e approcci vengono salvati in Firestore e i permessi di eliminazione e modifica sono applicati dalle regole.

La pagina locale è aperta a chiunque possa raggiungere l'indirizzo del server. Le API legacy non sono adatte a una gara pubblica con permessi individuali: per questo scenario configura Firebase e usa Firestore.

## Ruotare il token delle API legacy

Arresta il server, elimina `data/invite-token.txt` e riavvia con `npm start` per ruotare il token delle API legacy. Questo non chiude la pagina d'ingresso. I file di dati e il token sono esclusi da Git tramite `.gitignore`.

## Pubblicazione gratuita con GitHub Pages e Firebase

Questa modalità non richiede email o password. Firebase Authentication assegna automaticamente un'identità anonima al browser. Gli utenti e gli approcci vengono salvati in Firestore. Ogni partecipante può creare un proprio profilo e registrare approcci; tutti possono aprire i dettagli degli approcci, ma solo chi li ha registrati può modificarli. Solo l'amministratore può eliminare profili e approcci. Chiunque raggiunga il sito può leggere i profili e gli approcci, quindi non inserire dati personali o sensibili.

### Configurare Firebase

1. Crea un progetto su [Firebase Console](https://console.firebase.google.com/) e mantienilo sul piano gratuito **Spark**. Non collegare un account di fatturazione.
2. In **Authentication → Sign-in method**, abilita **Anonymous**.
3. In **Firestore Database**, crea il database. In **Regole**, incolla e pubblica il contenuto di `firestore.rules`.
4. Registra un'app Web nelle impostazioni del progetto Firebase e copia la configurazione web fornita.
5. Inserisci la configurazione Web in `firebase-config.js` e fai push dei file aggiornati.
6. Apri `/admin.html` nel browser che vuoi usare come amministratore. La pagina mostra l'UID anonimo Firebase di quel browser. Nella console Firestore crea il documento `settings/admin` con un solo campo `uid` (stringa) e incolla quell'UID. Ricarica `/admin.html`: solo quel browser sarà amministratore. Le regole negano la creazione e la modifica del documento dal sito.

Il documento `settings/admin` è condiviso fra GitHub Pages e `http://127.0.0.1:5500/` se usano lo stesso progetto Firebase. Aggiungi `127.0.0.1` e, se usato, `localhost` in **Authentication → Settings → Authorized domains**. Non condividere l'UID dell'amministratore; per sostituirlo, il proprietario del progetto deve aggiornare il documento dalla console Firestore.

Per testare in locale la versione collegata a Firebase, visita `http://127.0.0.1:5500/` oppure `http://localhost:3001`. Ogni origine può avere un UID anonimo differente, ma il documento `settings/admin` mantiene un unico amministratore per l'intero progetto Firebase.

   ```js
   window.firebaseConfig = {
     apiKey: "API_KEY",
     authDomain: "PROJECT_ID.firebaseapp.com",
     projectId: "PROJECT_ID",
     storageBucket: "PROJECT_ID.firebasestorage.app",
     messagingSenderId: "SENDER_ID",
     appId: "APP_ID"
   };
   ```

   Usa i valori esatti della configurazione copiata; non inserire password, chiavi Admin o credenziali di service account. La configurazione web è pubblica: l'accesso ai dati dipende dalle regole Firestore.

### Pubblicare su GitHub Pages

Il workflow `.github/workflows/deploy-sfida-pages.yml` nella radice del repository pubblica questa cartella come sito quando i cambiamenti arrivano sul branch `main`.

1. Fai push su GitHub dei file aggiornati, inclusi `firebase-config.js` e `firestore.rules`.
2. Nel repository apri **Settings → Pages** e scegli **GitHub Actions** come sorgente di build.
3. In **Actions**, verifica che **Deploy sfida su GitHub Pages** sia terminato con successo. L'indirizzo apparirà nel job di deploy e in **Settings → Pages**.
4. In Firebase Authentication → **Settings → Authorized domains**, aggiungi l'host del sito Pages (per questo repository: `hehetzu.github.io`).
5. Apri il sito e prova creazione profilo, salvataggio, ricaricamento e cancellazione da due dispositivi.

Per mantenere l'accesso amministratore usa lo stesso browser e non cancellare i dati del sito: l'identità anonima è legata al browser e alla relativa origine. Se l'identità viene persa, il proprietario del progetto può aggiornare `settings/admin.uid` dalla console Firestore con l'UID del nuovo browser amministratore.

La pagina usa Firebase direttamente dal browser e non richiede `server.js`, Node.js o Docker. Firestore salva gli utenti in `profiles/{id}` e gli approcci in `people/{id}`; gli ID degli approcci Firebase sono univoci per evitare sovrascritture quando più browser ne aggiungono contemporaneamente. Per trasferire i dati già presenti sul server CasaOS va fatta una migrazione una tantum. Il piano gratuito ha limiti di utilizzo: controllali nella console Firebase e non abilitare la fatturazione.

### Area amministratore

Apri `/admin.html` nello stesso browser e nella stessa origine il cui UID è registrato in `settings/admin`. La pagina mostra profili e approcci in tempo reale e consente all'amministratore di cancellare un approccio oppure un profilo insieme ai relativi approcci. Firestore verifica il ruolo per le cancellazioni. Profili e approcci restano leggibili dai partecipanti perché servono alla classifica e alla sincronizzazione della gara: non inserire dati sensibili.

## Eliminare un profilo

Dalla schermata di accesso su GitHub Pages o sulla pagina locale collegata a Firebase, l'amministratore seleziona il profilo e sceglie **Elimina il profilo selezionato**. Dopo la conferma vengono cancellati il profilo e tutti gli approcci e punti associati; l'operazione non si può annullare. La cancellazione è riservata all'UID registrato in `settings/admin` ed è verificata dalle regole Firestore, non solo dall'interfaccia. In modalità backend legacy locale, le eliminazioni sono disabilitate.
