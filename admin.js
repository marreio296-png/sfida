const statusElement = document.querySelector("#admin-status");
const contentElement = document.querySelector("#admin-content");
const refreshButton = document.querySelector("#refresh-button");
const profileCount = document.querySelector("#profile-count");
const peopleCount = document.querySelector("#people-count");
const adminUidElement = document.querySelector("#admin-uid");
const profilesList = document.querySelector("#profiles-list");
const peopleList = document.querySelector("#people-list");

let sdk;
let database;
let firebaseAuth;
let profiles = [];
let people = [];
let profilesUnsubscribe;
let peopleUnsubscribe;
let requestPending = false;
let firebaseAdminUid = "";

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
      meta: `ID: ${profile.id}${profile.ownerUid ? ` · UID proprietario: ${profile.ownerUid}` : ""}`,
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
        meta: `ID: ${person.id}${person.ownerUid ? ` · UID proprietario: ${person.ownerUid}` : ""}`,
        details,
        deleteLabel: `Elimina l'approccio ${person.name || person.id}`,
        onDelete: () => void deletePerson(person),
      });
    }));
  }
}

function requireAdmin() {
  if (!firebaseAdminUid || firebaseAuth?.currentUser?.uid !== firebaseAdminUid) {
    throw new Error("Accesso negato: questa pagina è riservata all'amministratore.");
  }
}

async function deleteProfile(profile) {
  if (requestPending) return;
  if (!window.confirm(`Eliminare il profilo di ${profile.name || profile.id} e tutti i suoi approcci?`)) return;

  requestPending = true;
  refreshButton.disabled = true;
  render();
  setStatus("Eliminazione del profilo e degli approcci collegati…");
  try {
    requireAdmin();
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
    requireAdmin();
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
  requireAdmin();
  const [profileSnapshots, peopleSnapshots] = await Promise.all([
    sdk.getDocs(sdk.collection(database, "profiles")),
    sdk.getDocs(sdk.collection(database, "people")),
  ]);
  profiles = profileSnapshots.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
  people = peopleSnapshots.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
  render();
}

async function initializeAdmin() {
  try {
    if (!window.firebaseConfig?.apiKey || !window.firebaseConfig?.projectId) {
      throw new Error("Configurazione Firebase mancante in firebase-config.js.");
    }
    setStatus("Connessione a Firebase e verifica dell'identità…");
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
    if (!firebaseAuth.currentUser) await authSdk.signInAnonymously(firebaseAuth);

    const identity = await firebaseAuth.currentUser.getIdTokenResult();
    if (identity.signInProvider !== "anonymous") {
      throw new Error("L'area amministratore richiede l'autenticazione anonima Firebase.");
    }
    if (typeof window.readFirebaseAdminUid !== "function") {
      throw new Error("Impossibile verificare l'amministratore Firebase.");
    }
    firebaseAdminUid = await window.readFirebaseAdminUid(sdk, database);
    if (!firebaseAdminUid) {
      throw new Error(
        `Amministratore non configurato. Crea settings/admin in Firestore con il campo uid impostato su: ${firebaseAuth.currentUser.uid}`,
      );
    }
    if (firebaseAuth.currentUser.uid !== firebaseAdminUid) {
      throw new Error("Accesso negato: questa pagina è riservata all'amministratore.");
    }

    adminUidElement.textContent = firebaseAuth.currentUser.uid;
    contentElement.hidden = false;
    refreshButton.disabled = false;
    await refreshData();
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
  } catch (error) {
    contentElement.hidden = true;
    refreshButton.disabled = true;
    setStatus(error instanceof Error ? error.message : "Impossibile inizializzare l'area admin.", "error");
  }
}

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

window.addEventListener("pagehide", () => {
  profilesUnsubscribe?.();
  peopleUnsubscribe?.();
});

void initializeAdmin();
