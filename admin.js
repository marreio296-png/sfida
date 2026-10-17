const statusElement = document.querySelector("#admin-status");
const contentElement = document.querySelector("#admin-content");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginButton = document.querySelector("#admin-login-button");
const resetPasswordButton = document.querySelector("#admin-reset-password");
const passwordToggle = document.querySelector("#toggle-password");
const refreshButton = document.querySelector("#refresh-button");
const signOutButton = document.querySelector("#admin-signout-button");
const profileCount = document.querySelector("#profile-count");
const peopleCount = document.querySelector("#people-count");
const adminUidElement = document.querySelector("#admin-uid");
const profilesList = document.querySelector("#profiles-list");
const peopleList = document.querySelector("#people-list");

let sdk;
let firebaseAuth;
let database;
let profiles = [];
let people = [];
let profilesUnsubscribe;
let peopleUnsubscribe;
let requestPending = false;

function isAdminUser(user) {
  return Boolean(window.isFirebaseAdminUser?.(user));
}

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.dataset.kind = kind;
}

function makeEmptyState(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = text;
  return paragraph;
}

function makeRecord({ title, meta, details, onDelete, deleteLabel }) {
  const article = document.createElement("article");
  article.className = "record";

  const heading = document.createElement("div");
  heading.className = "record-heading";
  const text = document.createElement("div");
  const titleElement = document.createElement("h3");
  titleElement.className = "record-title";
  titleElement.textContent = title;
  text.append(titleElement);

  if (meta) {
    const metaElement = document.createElement("p");
    metaElement.className = "record-meta";
    metaElement.textContent = meta;
    text.append(metaElement);
  }
  heading.append(text);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Elimina";
  deleteButton.setAttribute("aria-label", deleteLabel);
  deleteButton.disabled = requestPending;
  deleteButton.addEventListener("click", onDelete);
  heading.append(deleteButton);
  article.append(heading);

  if (details) {
    const detailsElement = document.createElement("p");
    detailsElement.className = "record-details";
    detailsElement.textContent = details;
    article.append(detailsElement);
  }
  return article;
}

function render() {
  profileCount.textContent = String(profiles.length);
  peopleCount.textContent = String(people.length);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  profilesList.replaceChildren();
  if (profiles.length === 0) {
    profilesList.append(makeEmptyState("Non ci sono profili salvati."));
  } else {
    profilesList.append(...profiles.map((profile) => makeRecord({
      title: profile.name || "Profilo senza nome",
      meta: `ID: ${profile.id}`,
      details: profile.photo ? "Foto profilo presente." : "",
      deleteLabel: `Elimina il profilo ${profile.name || profile.id} e i suoi approcci`,
      onDelete: () => void deleteProfile(profile),
    })));
  }

  peopleList.replaceChildren();
  if (people.length === 0) {
    peopleList.append(makeEmptyState("Non ci sono approcci registrati."));
  } else {
    peopleList.append(...people.map((person) => {
      const profile = profileById.get(person.profileId);
      const details = [
        person.palo === "No" ? "Approccio riuscito" : person.palo === "Sì" ? "Palo" : "Esito non indicato",
        profile ? `Partecipante: ${profile.name}` : "Partecipante non trovato",
        person.hairColor ? `Capelli: ${person.hairColor}` : "",
        person.age ? `Età: ${person.age}` : "",
        person.shoeRating ? `Scarpe: ${person.shoeRating}/5` : "",
        person.glassesRating ? `Occhiali: ${person.glassesRating}/5` : "",
        person.finalRating ? `Impressione generale: ${person.finalRating}/5` : "",
        Array.isArray(person.evaluations) && person.evaluations.length
          ? `Valutazioni: ${person.evaluations.map(({ name, rating }) => `${name} ${rating}/5`).join(", ")}`
          : "",
      ].filter(Boolean).join(" · ");

      return makeRecord({
        title: person.name || "Senza nome",
        meta: `ID: ${person.id}`,
        details,
        deleteLabel: `Elimina l'approccio ${person.name || person.id}`,
        onDelete: () => void deletePerson(person),
      });
    }));
  }
}

function requireDatabase() {
  if (!database) {
    throw new Error("Firestore non è inizializzato.");
  }
  if (!isAdminUser(firebaseAuth?.currentUser)) {
    throw new Error("Accesso non autorizzato.");
  }
}

function stopAdminListeners() {
  profilesUnsubscribe?.();
  peopleUnsubscribe?.();
  profilesUnsubscribe = undefined;
  peopleUnsubscribe = undefined;
}

async function deleteProfile(profile) {
  if (requestPending) return;
  if (!window.confirm(`Eliminare il profilo di ${profile.name || profile.id} e tutti i suoi approcci?`)) return;

  requestPending = true;
  refreshButton.disabled = true;
  render();
  setStatus("Eliminazione del profilo e degli approcci collegati…");
  try {
    requireDatabase();
    const linkedPeople = await sdk.getDocs(sdk.query(
      sdk.collection(database, "people"),
      sdk.where("profileId", "==", profile.id),
    ));
    for (let index = 0; index < linkedPeople.docs.length; index += 450) {
      const batch = sdk.writeBatch(database);
      linkedPeople.docs.slice(index, index + 450).forEach((snapshot) => batch.delete(snapshot.ref));
      await batch.commit();
    }
    await sdk.deleteDoc(sdk.doc(database, "profiles", profile.id));
    setStatus(`Profilo ${profile.name || profile.id} e ${linkedPeople.size} approcci collegati eliminati.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Errore durante l'eliminazione del profilo.", "error");
  } finally {
    requestPending = false;
    refreshButton.disabled = false;
    render();
  }
}

async function deletePerson(person) {
  if (requestPending) return;
  if (!window.confirm(`Eliminare l'approccio ${person.name || person.id}?`)) return;

  requestPending = true;
  refreshButton.disabled = true;
  render();
  setStatus("Eliminazione dell'approccio…");
  try {
    requireDatabase();
    await sdk.deleteDoc(sdk.doc(database, "people", String(person.id)));
    setStatus(`Approccio ${person.name || person.id} eliminato.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Errore durante l'eliminazione dell'approccio.", "error");
  } finally {
    requestPending = false;
    refreshButton.disabled = false;
    render();
  }
}

async function refreshData() {
  requireDatabase();
  const [profileSnapshots, peopleSnapshots] = await Promise.all([
    sdk.getDocs(sdk.collection(database, "profiles")),
    sdk.getDocs(sdk.collection(database, "people")),
  ]);
  profiles = profileSnapshots.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
  people = peopleSnapshots.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
  render();
}

async function showAdminArea() {
  if (!isAdminUser(firebaseAuth.currentUser)) {
    throw new Error("Accesso riservato all'amministratore.");
  }
  await refreshData();
  loginForm.hidden = true;
  contentElement.hidden = false;
  refreshButton.disabled = false;
  signOutButton.hidden = false;
  adminUidElement.textContent = "Emanuele";
  stopAdminListeners();
  profilesUnsubscribe = sdk.onSnapshot(
    sdk.collection(database, "profiles"),
    (snapshot) => {
      profiles = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      render();
    },
    (error) => setStatus(`Non è stato possibile aggiornare i profili: ${error.message}`, "error"),
  );
  peopleUnsubscribe = sdk.onSnapshot(
    sdk.collection(database, "people"),
    (snapshot) => {
      people = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      render();
    },
    (error) => setStatus(`Non è stato possibile aggiornare gli approcci: ${error.message}`, "error"),
  );
  setStatus("Accesso amministratore verificato. Dati aggiornati in tempo reale.", "success");
}

async function initializeAdmin() {
  try {
    if (!window.firebaseConfig?.apiKey || !window.firebaseConfig?.projectId ||
      !window.firebaseAdminEmail) {
      throw new Error("Configurazione Firebase mancante in firebase-config.js.");
    }
    setStatus("Connessione a Firebase…");
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"),
    ]);
    sdk = { ...authSdk, ...firestoreSdk };
    const app = appSdk.initializeApp(window.firebaseConfig);
    firebaseAuth = authSdk.getAuth(app);
    database = firestoreSdk.getFirestore(app);
    await firebaseAuth.authStateReady();
    if (isAdminUser(firebaseAuth.currentUser)) {
      await showAdminArea();
    } else {
      loginForm.hidden = false;
      setStatus("Inserisci la password amministratore di Emanuele.");
      passwordInput.focus();
    }
  } catch (error) {
    contentElement.hidden = true;
    refreshButton.disabled = true;
    loginForm.hidden = !firebaseAuth;
    loginButton.disabled = !firebaseAuth;
    signOutButton.hidden = !isAdminUser(firebaseAuth?.currentUser);
    setStatus(error instanceof Error ? error.message : "Impossibile inizializzare l'area admin.", "error");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!firebaseAuth || !sdk) {
    setStatus("Firebase non è pronto. Ricarica la pagina.", "error");
    return;
  }
  loginButton.disabled = true;
  setStatus("Verifica della password…");
  try {
    await sdk.signInWithEmailAndPassword(
      firebaseAuth,
      window.firebaseAdminEmail,
      passwordInput.value,
    );
    passwordInput.value = "";
    await showAdminArea();
  } catch (error) {
    setStatus(error?.code === "auth/operation-not-allowed"
      ? "L'accesso con password non è abilitato in Firebase."
      : error?.code === "auth/network-request-failed"
        ? "Firebase non è raggiungibile. Controlla la connessione e riprova."
        : error?.code?.startsWith("auth/")
          ? "Password non valida o accesso non disponibile."
          : error instanceof Error
            ? error.message
            : "Non è stato possibile aprire i dati amministrativi.", "error");
    if (!contentElement.hidden) {
      contentElement.hidden = true;
    } else {
      loginForm.hidden = false;
    }
    signOutButton.hidden = !isAdminUser(firebaseAuth.currentUser);
    loginButton.disabled = false;
    passwordInput.focus();
    if (error?.code?.startsWith("auth/")) passwordInput.select();
  }
});

resetPasswordButton.addEventListener("click", async () => {
  if (!firebaseAuth || !sdk) {
    setStatus("Firebase non è pronto. Ricarica la pagina.", "error");
    return;
  }
  resetPasswordButton.disabled = true;
  setStatus("Invio del link per impostare la password…");
  try {
    await sdk.sendPasswordResetEmail(firebaseAuth, window.firebaseAdminEmail);
    setStatus("Se l'account esiste, Firebase ha inviato il link all'indirizzo amministratore. Controlla anche la cartella spam.", "success");
  } catch (error) {
    setStatus(error?.code === "auth/network-request-failed"
      ? "Firebase non è raggiungibile. Controlla la connessione e riprova."
      : error?.code === "auth/unauthorized-continue-uri"
        ? "Il dominio del sito non è autorizzato in Firebase Authentication."
        : "Non è stato possibile inviare il link. Verifica la configurazione Firebase e riprova.", "error");
  } finally {
    resetPasswordButton.disabled = false;
  }
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    await refreshData();
    setStatus("Dati aggiornati.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Aggiornamento non riuscito.", "error");
  } finally {
    refreshButton.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    stopAdminListeners();
    await sdk.signOut(firebaseAuth);
    contentElement.hidden = true;
    refreshButton.disabled = true;
    signOutButton.hidden = true;
    loginForm.hidden = false;
    loginButton.disabled = false;
    setStatus("Sei uscito dall'area amministratore.");
    passwordInput.focus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Non è stato possibile uscire.", "error");
  } finally {
    signOutButton.disabled = false;
  }
});

passwordToggle.addEventListener("click", () => {
  const showingPassword = passwordInput.type === "password";
  passwordInput.type = showingPassword ? "text" : "password";
  passwordToggle.textContent = showingPassword ? "Nascondi" : "Mostra";
  passwordToggle.setAttribute("aria-label", showingPassword ? "Nascondi password" : "Mostra password");
  passwordToggle.setAttribute("aria-pressed", String(showingPassword));
  passwordInput.focus();
});

window.addEventListener("pagehide", () => {
  stopAdminListeners();
});

void initializeAdmin();
