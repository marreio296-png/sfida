# Sfida del club

`package.json` serve per il comando `npm start`; i dati locali del backend vengono creati in `data/`.

L'istogramma nella classifica mostra i primi tre partecipanti; con più di tre, **Vedi tutto** apre il grafico completo di riusciti e pali.

## Avvio del server locale

Il server locale serve la pagina e le API a chiunque raggiunga il suo indirizzo, senza link d'invito. Avvialo sul PC che ospita la gara:

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

Apri `http://192.168.1.150:3001` dagli altri dispositivi. Se Windows Firewall lo richiede, consenti Node.js sulla rete privata per la porta 3001. Non inoltrare questa porta su Internet: il backend legacy non applica permessi individuali.

Il backend locale non supporta l'eliminazione di profili o approcci né le modifiche individuali, perché non ha identità amministrative individuali. Con Firebase configurato, profili e approcci vengono salvati in Firestore e i permessi di eliminazione e modifica sono applicati dalle regole.

La pagina locale è aperta a chiunque possa raggiungere l'indirizzo del server. Le API legacy non sono adatte a una gara pubblica con permessi individuali: per questo scenario configura Firebase e usa Firestore.

## Pubblicazione gratuita con GitHub Pages e Firebase

Questa modalità non richiede email o password. Firebase Authentication assegna automaticamente un'identità anonima al browser. Gli utenti e gli approcci vengono salvati in Firestore. Ogni partecipante può creare un proprio profilo e registrare approcci; tutti possono aprire i dettagli degli approcci, ma solo chi li ha registrati può modificarli. Solo l'amministratore può eliminare profili e approcci. Chiunque raggiunga il sito può leggere i profili e gli approcci, quindi non inserire dati personali o sensibili.

### Configurare Firebase

1. Crea un progetto su [Firebase Console](https://console.firebase.google.com/) e mantienilo sul piano gratuito **Spark**. Non collegare un account di fatturazione.
2. In **Authentication → Sign-in method**, abilita **Anonymous**.
3. In **Firestore Database**, crea il database. In **Regole**, incolla e pubblica il contenuto di `firestore.rules`.
4. In **Authentication → Metodo di accesso**, abilita sia **Anonimo** sia **Email/password**.
5. In **Authentication → Utenti**, crea l'account `emanuele.admin@sfida-554ff.firebaseapp.com` con una password robusta da consegnare solo a Emanuele.
6. Registra un'app Web nelle impostazioni del progetto Firebase e copia la configurazione web fornita.
7. Inserisci la configurazione Web in `firebase-config.js`, pubblica il contenuto di `firestore.rules` e fai push dei file aggiornati.

La pagina `/admin.html` richiede solo la password dell'account Emanuele. Gli utenti normali continuano a usare l'accesso anonimo, automatico e senza password. La protezione delle operazioni amministrative è applicata da Firestore e non dipende solo dall'interfaccia.

Il login amministratore con password è disponibile sul dominio GitHub Pages autorizzato di Firebase. Per testare in locale, aggiungi `127.0.0.1` e, se usato, `localhost` in **Authentication → Impostazioni → Domini autorizzati**.

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
4. In Firebase Authentication → **Impostazioni → Domini autorizzati**, verifica che `marreio296-png.github.io` sia presente.
5. Apri il sito e prova creazione profilo, salvataggio, ricaricamento e cancellazione da due dispositivi.

L'accesso amministratore usa una password Firebase; non inserirla nel codice del sito né condividerla nei messaggi del gruppo.

La pagina usa Firebase direttamente dal browser e non richiede `server.js`, Node.js o Docker. Firestore salva gli utenti in `profiles/{id}` e gli approcci in `people/{id}`; gli ID degli approcci Firebase sono univoci per evitare sovrascritture quando più browser ne aggiungono contemporaneamente. Per trasferire i dati già presenti sul server CasaOS va fatta una migrazione una tantum. Il piano gratuito ha limiti di utilizzo: controllali nella console Firebase e non abilitare la fatturazione.

### Area amministratore

Apri `/admin.html` e inserisci la password dell'account amministratore. La pagina mostra profili e approcci in tempo reale e consente a Emanuele di cancellare un approccio oppure un profilo insieme ai relativi approcci. Firestore verifica il ruolo per le cancellazioni. Profili e approcci restano leggibili dai partecipanti perché servono alla classifica e alla sincronizzazione della gara: non inserire dati sensibili.

## Eliminare un profilo

Dalla schermata di accesso su GitHub Pages o sulla pagina locale collegata a Firebase, Emanuele seleziona il profilo e sceglie **Elimina il profilo selezionato**. Dopo la conferma vengono cancellati il profilo e tutti gli approcci e punti associati; l'operazione non si può annullare. La cancellazione è limitata all'account email/password amministratore dalle regole Firestore. In modalità backend legacy locale, le eliminazioni sono disabilitate.
