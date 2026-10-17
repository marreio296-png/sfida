const profileStorageKey = "tpsi3-participant-profiles";
const activeProfileStorageKey = "tpsi3-active-participant";
const accessPanel = document.querySelector("#access-panel");
const accessForm = document.querySelector("#access-form");
const accessMessage = document.querySelector("#access-message");
const adminDashboardLink = document.querySelector("#admin-dashboard-link");
const accessSubmit = document.querySelector("#access-submit");
const returningFields = document.querySelector("#returning-fields");
const newProfileFields = document.querySelector("#new-profile-fields");
const savedProfileSelect = document.querySelector("#saved-profile");
const deleteProfileButton = document.querySelector("#delete-profile");
const profileNameInput = document.querySelector("#profile-name");
const profilePhotoInput = document.querySelector("#profile-photo");
const groupApp = document.querySelector("#group-app");
const activeProfileContainer = document.querySelector("#active-profile");
const switchProfileButton = document.querySelector("#switch-profile");
const form = document.querySelector("#person-form");
const nameInput = document.querySelector("#person-name");
const message = document.querySelector("#form-message");
const approachDialog = document.querySelector("#approach-dialog");
const approachTitle = document.querySelector("#entry-title");
const approachStep = document.querySelector("#approach-step");
const approachSubmitButton = form.querySelector('button[type="submit"]');
const openApproachFormButton = document.querySelector("#open-approach-form");
const closeApproachFormButton = document.querySelector("#close-approach-form");
const participantList = document.querySelector("#participant-list");
const participantCount = document.querySelector("#participant-count");
const emptyState = document.querySelector("#empty-state");
const raceSection = document.querySelector("#race-section");
const raceTrack = document.querySelector("#race-track");
const leaderboardChart = document.querySelector("#leaderboard-chart");
const fullLeaderboardButton = document.querySelector("#show-full-leaderboard");
const leaderboardDialog = document.querySelector("#leaderboard-dialog");
const closeLeaderboardDialogButton = document.querySelector("#close-leaderboard-dialog");
const fullLeaderboardChart = document.querySelector("#full-leaderboard-chart");
const raceResult = document.querySelector("#race-result");
const outcomeButtons = document.querySelectorAll(".outcome-button");
const starRatingGroups = document.querySelectorAll(".star-rating");
const sharedGroupStorageKey = "tpsi3-shared-group";
const sharedGroupChannelName = "tpsi3-shared-group-live";
let lastSyncError = "";

let profiles = [];
let activeProfile = null;
let groupPeople = [];
let nextId = 1;
let raceRunning = false;
let raceRoster = [];
let raceProgress = {};
let sharedGroupChannel = null;
let firebaseApp = null;
let firebaseDatabase = null;
let firebaseSdk = null;
let firebaseProfilesUnsubscribe = null;
let firebaseGroupUnsubscribe = null;
let editingPersonId = "";

function hasFirebaseConfig() {
  const config = window.firebaseConfig;
  return Boolean(config && typeof config.apiKey === "string" &&
    config.apiKey && !config.apiKey.startsWith("INSERISCI_") &&
    typeof config.projectId === "string" && config.projectId &&
    typeof config.appId === "string" && config.appId);
}

function canDeleteRecords() {
  return window.location.protocol === "file:" ||
    Boolean(firebaseDatabase);
}

function canEditPerson(person) {
  return Boolean(activeProfile?.id && person.profileId === activeProfile.id);
}

async function initializeFirebase() {
  const config = window.firebaseConfig;
  const [appSdk, firestoreSdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"),
  ]);
  firebaseSdk = firestoreSdk;
  firebaseApp = appSdk.initializeApp(config);
  firebaseDatabase = firestoreSdk.getFirestore(firebaseApp);
}

function loadProfiles() {
  const savedProfiles = localStorage.getItem(profileStorageKey);
  if (!savedProfiles) return [];

  const parsedProfiles = JSON.parse(savedProfiles);
  if (!Array.isArray(parsedProfiles) || parsedProfiles.some((profile) =>
    typeof profile.id !== "string" || typeof profile.name !== "string" ||
    typeof profile.photo !== "string"
  )) {
    throw new Error("I profili salvati non sono leggibili. Cancella i dati del sito e registrati di nuovo.");
  }
  return parsedProfiles;
}

async function readRemoteJson(url) {
  if (window.location.protocol === "file:") {
    throw new Error("Backend non disponibile in modalità file.");
  }
  if (firebaseDatabase) {
    if (url === "/api/profiles") {
      const profileSnapshots = await firebaseSdk.getDocs(
        firebaseSdk.collection(firebaseDatabase, "profiles"),
      );
      return profileSnapshots.docs.map((profileSnapshot) => ({
        ...profileSnapshot.data(),
        id: profileSnapshot.id,
      }));
    }
    if (url === "/api/group") {
      const peopleSnapshot = await firebaseSdk.getDocs(
        firebaseSdk.collection(firebaseDatabase, "people"),
      );
      const people = peopleSnapshot.docs.map((personSnapshot) => ({
        ...personSnapshot.data(),
        id: personSnapshot.id,
      }));
      return { people, progress: calculateRaceProgress(people) };
    }
    throw new Error(`Risorsa Firebase non supportata: ${url}`);
  }
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error("Impossibile contattare il backend.");
  }
  return response.json();
}

async function saveRemoteProfile(profile) {
  if (window.location.protocol === "file:") return profile;
  if (firebaseDatabase) {
    await firebaseSdk.setDoc(
      firebaseSdk.doc(firebaseDatabase, "profiles", profile.id),
      profile,
    );
    return profile;
  }
  const response = await fetch("/api/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: profile.name, photo: profile.photo }),
  });
  if (!response.ok) {
    throw new Error(response.status === 413
      ? "La richiesta supera la dimensione massima consentita."
      : "Non è stato possibile salvare il profilo sul backend.");
  }
  return response.json();
}

async function deleteRemoteProfile(profileId) {
  if (window.location.protocol === "file:") return null;
  if (firebaseDatabase) {
    const linkedPeople = await firebaseSdk.getDocs(
      firebaseSdk.query(
        firebaseSdk.collection(firebaseDatabase, "people"),
        firebaseSdk.where("profileId", "==", profileId),
      ),
    );
    for (let index = 0; index < linkedPeople.docs.length; index += 450) {
      const batch = firebaseSdk.writeBatch(firebaseDatabase);
      linkedPeople.docs.slice(index, index + 450).forEach((personSnapshot) => {
        batch.delete(personSnapshot.ref);
      });
      await batch.commit();
    }
    await firebaseSdk.deleteDoc(firebaseSdk.doc(firebaseDatabase, "profiles", profileId));
    return { group: await readRemoteJson("/api/group") };
  }
  const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}`, {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(response.status === 501
      ? "L'eliminazione non è supportata dal backend locale."
      : response.status === 404
        ? "Il profilo è già stato eliminato. Aggiorna la pagina."
        : "Non è stato possibile eliminare il profilo dal backend.");
  }
  return response.json();
}

function saveProfiles(updatedProfiles) {
  localStorage.setItem(profileStorageKey, JSON.stringify(updatedProfiles));
  profiles = updatedProfiles;
}

function groupStorageKey(profileId) {
  return `tpsi3-group-${profileId}`;
}

function validateGroup(parsedGroup) {
  if (!Array.isArray(parsedGroup) || parsedGroup.some((person) =>
    (typeof person.id !== "number" && (typeof person.id !== "string" || !person.id)) ||
    typeof person.name !== "string" ||
    typeof person.profileId !== "string" || typeof person.hairColor !== "string" ||
    typeof person.age !== "string" || typeof person.palo !== "string" ||
    typeof person.rating !== "number" ||
    ["shoeRating", "glassesRating", "finalRating"].some((field) =>
      person[field] !== undefined &&
      (typeof person[field] !== "number" || person[field] < 0.5 || person[field] > 5 || person[field] * 2 % 1 !== 0)
    ) ||
    (person.evaluations !== undefined && (!Array.isArray(person.evaluations) || person.evaluations.some((evaluation) =>
      !evaluation || typeof evaluation.name !== "string" ||
      !Number.isInteger(evaluation.rating) || evaluation.rating < 1 || evaluation.rating > 5
    ))) ||
    (person.details !== undefined && (!Array.isArray(person.details) || person.details.some((detail) =>
      !detail || typeof detail.label !== "string" || typeof detail.value !== "string"
    )))
  )) {
    throw new Error("Le persone salvate in questo gruppo non sono leggibili.");
  }
  return parsedGroup;
}

function loadLegacyGroup(profileId) {
  const savedGroup = localStorage.getItem(groupStorageKey(profileId));
  return savedGroup ? validateGroup(JSON.parse(savedGroup)) : [];
}

function loadGroup() {
  const savedGroup = localStorage.getItem(sharedGroupStorageKey);
  if (savedGroup) {
    const parsed = JSON.parse(savedGroup);
    if (Array.isArray(parsed)) {
      const migratedGroup = validateGroup(parsed);
      raceProgress = calculateRaceProgress(migratedGroup);
      localStorage.setItem(sharedGroupStorageKey, JSON.stringify({ people: migratedGroup, progress: raceProgress }));
      return migratedGroup;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.people)) {
      throw new Error("I dati del gruppo salvati non sono leggibili.");
    }
    const savedProgress = parsed.progress || {};
    if (typeof savedProgress !== "object" || Object.values(savedProgress).some((value) =>
      !Number.isInteger(value) || value < 0
    )) {
      throw new Error("I progressi della gara salvati non sono leggibili.");
    }
    const savedPeople = validateGroup(parsed.people);
    raceProgress = calculateRaceProgress(savedPeople);
    return savedPeople;
  }

  const previousGroups = profiles.flatMap((profile) => loadLegacyGroup(profile.id));
  if (previousGroups.length > 0) {
    const migratedGroup = previousGroups.map((person, index) => ({ ...person, id: index + 1 }));
    raceProgress = calculateRaceProgress(migratedGroup);
    localStorage.setItem(sharedGroupStorageKey, JSON.stringify({ people: migratedGroup, progress: raceProgress }));
    return migratedGroup;
  }
  raceProgress = {};
  return [];
}

async function loadGroupFromServer() {
  if (window.location.protocol === "file:") return loadGroup();
  const payload = await readRemoteJson("/api/group");
  const normalizedState = normalizeSharedGroupState(payload);
  groupPeople = normalizedState.people;
  raceProgress = normalizedState.progress;
  return normalizedState.people;
}

async function persistGroupToServer(sharedState, deletedIds) {
  if (window.location.protocol === "file:") return;
  if (firebaseDatabase) {
    const savedPeople = await firebaseSdk.getDocs(
      firebaseSdk.collection(firebaseDatabase, "people"),
    );
    const peopleById = new Map(
      savedPeople.docs.map((personSnapshot) => [personSnapshot.id, personSnapshot]),
    );
    const nextPeopleById = new Map(sharedState.people.map((person) => [String(person.id), person]));
    const batch = firebaseSdk.writeBatch(firebaseDatabase);
    let writes = 0;

    for (const [personId, personSnapshot] of peopleById) {
      if (!nextPeopleById.has(personId)) {
        batch.delete(personSnapshot.ref);
        writes += 1;
      }
    }
    for (const person of sharedState.people) {
      if (!peopleById.has(String(person.id))) {
        batch.set(
          firebaseSdk.doc(firebaseDatabase, "people", String(person.id)),
          person,
        );
        writes += 1;
        continue;
      }

      const existingPerson = peopleById.get(String(person.id)).data();
      const unchanged = Object.keys(existingPerson).length === Object.keys(person).length &&
        Object.keys(person).every((field) =>
          JSON.stringify(existingPerson[field]) === JSON.stringify(person[field])
        );
      if (!unchanged) {
        batch.set(
          firebaseSdk.doc(firebaseDatabase, "people", String(person.id)),
          person,
        );
        writes += 1;
      }
    }
    if (writes > 0) await batch.commit();
    return;
  }
  const response = await fetch("/api/group", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...sharedState, deleteIds: deletedIds }),
  });
  if (!response.ok) {
    const errorMessage = response.status === 501
      ? "Il backend locale non supporta l'eliminazione degli approcci."
      : response.status === 409
          ? "Il gruppo è cambiato da un altro dispositivo. Aggiorna la pagina."
          : response.status === 413
            ? "La richiesta supera la dimensione massima consentita."
            : "Non è stato possibile salvare la gara sul server.";
    throw new Error(errorMessage);
  }
  return response.json();
}

function normalizeSharedGroupState(rawState) {
  if (!rawState || typeof rawState !== "object" || !Array.isArray(rawState.people)) {
    throw new Error("I dati condivisi del gruppo non sono leggibili.");
  }

  const normalizedPeople = validateGroup(rawState.people);
  const normalizedProgress = rawState.progress || {};
  if (typeof normalizedProgress !== "object" || Object.values(normalizedProgress).some((value) =>
    !Number.isInteger(value) || value < 0
  )) {
    throw new Error("I progressi della gara condivisi non sono leggibili.");
  }

  const sharedProgress = calculateRaceProgress(normalizedPeople);

  return { people: normalizedPeople, progress: sharedProgress };
}

function calculateRaceProgress(people) {
  return people.reduce((progress, person) => {
    if (person.palo === "No") {
      progress[person.profileId] = (progress[person.profileId] || 0) + 1;
    }
    return progress;
  }, {});
}

function applySharedGroupState(rawState, { notify = false } = {}) {
  try {
    const normalizedState = normalizeSharedGroupState(rawState);
    groupPeople = normalizedState.people;
    raceProgress = normalizedState.progress;
    nextId = groupPeople.reduce((next, person) =>
      typeof person.id === "number" ? Math.max(next, person.id + 1) : next, 1);
    if (notify && activeProfile) {
      raceResult.textContent = "Diario aggiornato.";
    }
    renderGroup();
  } catch (error) {
    if (notify) {
      message.textContent = error instanceof Error ? error.message : "Non è stato possibile sincronizzare il gruppo.";
    }
  }
}

async function saveGroup(updatedGroup) {
  if (!activeProfile) throw new Error("Accedi al tuo profilo prima di salvare il gruppo.");
  const updatedProgress = calculateRaceProgress(updatedGroup);
  const sharedState = { people: updatedGroup, progress: updatedProgress };
  const nextIds = new Set(updatedGroup.map((person) => String(person.id)));
  const deletedIds = groupPeople
    .filter((person) => !nextIds.has(String(person.id)))
    .map((person) => String(person.id));
  const persistedState = await persistGroupToServer(sharedState, deletedIds);
  const savedState = persistedState ? normalizeSharedGroupState(persistedState) : sharedState;
  localStorage.setItem(sharedGroupStorageKey, JSON.stringify(savedState));
  if (sharedGroupChannel) {
    sharedGroupChannel.postMessage(savedState);
  }
  groupPeople = savedState.people;
  raceProgress = savedState.progress;
}

function createAvatar(profile, className) {
  if (profile.photo) {
    const image = document.createElement("img");
    image.className = className;
    image.src = profile.photo;
    image.alt = `Foto del partecipante ${profile.name}`;
    return image;
  }

  const initial = document.createElement("span");
  initial.className = `${className} avatar-fallback`;
  initial.setAttribute("aria-label", `Nessuna foto per ${profile.name}`);
  initial.textContent = profile.name.trim().charAt(0).toUpperCase();
  return initial;
}

function updateAccessFields() {
  const accessType = accessForm.elements["access-type"].value;
  returningFields.hidden = accessType !== "returning";
  newProfileFields.hidden = accessType !== "new";
  profileNameInput.required = accessType === "new";
  accessSubmit.disabled = !accessType;
  accessMessage.textContent = "";
}

function populateProfileSelects() {
  savedProfileSelect.replaceChildren();
  const selectableProfiles = profiles;

  const emptyLoginOption = document.createElement("option");
  emptyLoginOption.value = "";
  emptyLoginOption.textContent = selectableProfiles.length
    ? "Scegli il tuo profilo"
    : "Scegli il tuo profilo";
  savedProfileSelect.append(emptyLoginOption);

  for (const profile of selectableProfiles) {
    const loginOption = document.createElement("option");
    loginOption.value = profile.id;
    loginOption.textContent = profile.name;
    savedProfileSelect.append(loginOption);
  }

  savedProfileSelect.disabled = selectableProfiles.length === 0;
  deleteProfileButton.hidden = false;
  deleteProfileButton.disabled = selectableProfiles.length === 0 || !savedProfileSelect.value ||
    !canDeleteRecords();
  deleteProfileButton.title = "";
}

function removeProfileDataFromLocalGroup(profileId) {
  const savedGroup = localStorage.getItem(sharedGroupStorageKey);
  if (savedGroup) {
    const parsedState = JSON.parse(savedGroup);
    const savedPeople = Array.isArray(parsedState)
      ? validateGroup(parsedState)
      : validateGroup(parsedState.people);
    const people = savedPeople.filter((person) => person.profileId !== profileId);
    const progress = calculateRaceProgress(people);
    const nextState = { people, progress };
    localStorage.setItem(sharedGroupStorageKey, JSON.stringify(nextState));
    groupPeople = people;
    raceProgress = progress;
    if (sharedGroupChannel) sharedGroupChannel.postMessage(nextState);
  } else {
    groupPeople = groupPeople.filter((person) => person.profileId !== profileId);
    raceProgress = calculateRaceProgress(groupPeople);
  }
  localStorage.removeItem(groupStorageKey(profileId));
}

function persistDeletedProfileGroup(group) {
  const normalizedState = normalizeSharedGroupState(group);
  const sharedState = { people: normalizedState.people, progress: normalizedState.progress };
  localStorage.setItem(sharedGroupStorageKey, JSON.stringify(sharedState));
  groupPeople = sharedState.people;
  raceProgress = sharedState.progress;
  if (sharedGroupChannel) sharedGroupChannel.postMessage(sharedState);
}

function applyRemoteProfiles(remoteProfiles) {
  if (!Array.isArray(remoteProfiles)) {
    throw new Error("La lista dei profili ricevuta dal server non è valida.");
  }
  profiles = remoteProfiles;
  saveProfiles(profiles);
  populateProfileSelects();

  if (!activeProfile) {
    const rememberedProfileId = localStorage.getItem(activeProfileStorageKey);
    const rememberedProfile = profiles.find((profile) => profile.id === rememberedProfileId);
    if (rememberedProfile) void enterProfile(rememberedProfile);
    else if (rememberedProfileId) localStorage.removeItem(activeProfileStorageKey);
    return;
  }

  const refreshedProfile = profiles.find((profile) => profile.id === activeProfile.id);
  if (refreshedProfile) {
    activeProfile = refreshedProfile;
    renderActiveProfile();
    return;
  }

  localStorage.removeItem(activeProfileStorageKey);
  activeProfile = null;
  groupPeople = [];
  raceProgress = {};
  groupApp.hidden = true;
  accessPanel.hidden = false;
  accessForm.reset();
  updateAccessFields();
  accessMessage.textContent = "Il profilo attivo è stato eliminato da un altro partecipante.";
}

function startFirebaseListeners() {
  if (!firebaseDatabase || firebaseProfilesUnsubscribe) return;
  firebaseProfilesUnsubscribe = firebaseSdk.onSnapshot(
    firebaseSdk.collection(firebaseDatabase, "profiles"),
    (snapshot) => {
      try {
        applyRemoteProfiles(snapshot.docs.map((profileSnapshot) => profileSnapshot.data()));
      } catch (error) {
        accessMessage.textContent = error instanceof Error
          ? error.message
          : "Non è stato possibile aggiornare i profili.";
      }
    },
    (error) => {
      const target = activeProfile ? message : accessMessage;
      target.textContent = `Sincronizzazione dei profili non riuscita: ${error.message}`;
    },
  );
}

function startFirebaseGroupListener() {
  if (!firebaseDatabase || firebaseGroupUnsubscribe) return;
  firebaseGroupUnsubscribe = firebaseSdk.onSnapshot(
    firebaseSdk.collection(firebaseDatabase, "people"),
    (snapshot) => {
      const people = snapshot.docs.map((personSnapshot) => ({
        ...personSnapshot.data(),
        id: personSnapshot.id,
      }));
      applySharedGroupState(
        { people, progress: calculateRaceProgress(people) },
        { notify: Boolean(activeProfile) },
      );
    },
    (error) => {
      message.textContent = `Sincronizzazione della gara non riuscita: ${error.message}`;
    },
  );
}

function createParticipantCard(person) {
  const item = document.createElement("li");
  item.className = "participant";
  const linkedProfile = profiles.find((profile) => profile.id === person.profileId);

  if (linkedProfile) {
    item.append(createAvatar(linkedProfile, "participant-avatar"));
  } else {
    const noPhoto = document.createElement("span");
    noPhoto.className = "participant-avatar avatar-fallback";
    noPhoto.setAttribute("aria-label", "Nessun partecipante collegato");
    noPhoto.textContent = person.name.trim().charAt(0).toUpperCase();
    item.append(noPhoto);
  }

  const details = document.createElement("div");
  details.className = "participant-details";
  const name = document.createElement("strong");
  name.textContent = person.name || "Senza nome";
  const outcome = document.createElement("span");
  outcome.textContent = person.palo === "No"
    ? "Approccio riuscito"
    : person.palo === "Sì"
      ? "Palo"
      : "Esito non registrato";

  const specifications = document.createElement("details");
  specifications.className = "participant-specifications";
  const specificationsSummary = document.createElement("summary");
  specificationsSummary.textContent = "Vedi dettagli";
  const specificationList = document.createElement("dl");
  specificationList.className = "participant-specification-list";
  const addSpecification = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    specificationList.append(term, description);
  };

  addSpecification("Partecipante", linkedProfile?.name);
  addSpecification("Esito", person.palo === "No" ? "Riuscito" : person.palo === "Sì" ? "Palo" : "Non registrato");
  addSpecification("Età", person.age ? `${person.age} anni` : "");
  addSpecification("Capelli", person.hairColor);
  addSpecification("Scarpe", person.shoeRating ? `${person.shoeRating}/5` : "");
  addSpecification("Occhiali", person.glassesRating ? `${person.glassesRating}/5` : "");
  addSpecification("Impressione generale", person.finalRating ? `${person.finalRating}/5` : "");
  if (Array.isArray(person.evaluations)) {
    person.evaluations.forEach(({ name: evaluator, rating }) => {
      addSpecification(`Valutazione di ${evaluator}`, `${rating}/5`);
    });
  }
  if (Array.isArray(person.details)) {
    person.details.forEach((detail) => addSpecification(detail.label, detail.value));
  }
  specifications.append(specificationsSummary, specificationList);
  details.append(name, outcome, specifications);

  const removeButton = document.createElement("button");
  removeButton.className = "remove-button";
  removeButton.type = "button";
  removeButton.textContent = "Rimuovi";
  removeButton.setAttribute("aria-label", `Rimuovi l'approccio ${person.name || "anonimo"}`);
  const canRemove = canDeleteRecords();
  removeButton.disabled = raceRunning || !canRemove;
  if (!canRemove) {
    removeButton.title = "L'eliminazione non è disponibile in questa modalità.";
  }
  removeButton.addEventListener("click", async () => {
    try {
      const updatedGroup = groupPeople.filter((groupPerson) => groupPerson.id !== person.id);
      await saveGroup(updatedGroup);
      raceResult.textContent = "";
      renderGroup();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "Non è stato possibile aggiornare il gruppo.";
    }
  });

  const actions = document.createElement("div");
  actions.className = "participant-actions";
  if (canEditPerson(person)) {
    const editButton = document.createElement("button");
    editButton.className = "secondary-button";
    editButton.type = "button";
    editButton.textContent = "Modifica";
    editButton.disabled = raceRunning;
    editButton.setAttribute("aria-label", `Modifica l'approccio ${person.name || "anonimo"}`);
    editButton.addEventListener("click", () => openPersonEditor(person));
    actions.append(editButton);
  }
  if (canDeleteRecords()) actions.append(removeButton);

  item.append(details, actions);
  return item;
}

function getProfileOutcomeStats(profileId) {
  return groupPeople.reduce((stats, person) => {
    if (person.profileId === profileId) {
      stats.attempts += 1;
      if (person.palo === "No") stats.successes += 1;
      if (person.palo === "Sì") stats.rejections += 1;
    }
    return stats;
  }, { attempts: 0, successes: 0, rejections: 0 });
}

function createRaceLane(profile, laneNumber, progress, previousProgress = progress, isLeader = false) {
  const lane = document.createElement("div");
  lane.className = "race-lane";
  if (isLeader) lane.classList.add("is-leader");
  lane.style.setProperty("--horse-coat", ["#a75d35", "#5b6f8d", "#a24741", "#987044", "#6c7950", "#72537d"][(laneNumber - 1) % 6]);
  const stats = getProfileOutcomeStats(profile.id);
  lane.setAttribute("aria-label", `Corsia ${laneNumber}: ${profile.name}, ${stats.successes} approcci riusciti e ${stats.rejections} rifiuti`);

  const medal = document.createElement("span");
  medal.className = "lane-medal";
  medal.textContent = stats.attempts ? ["🥇", "🥈", "🥉"][laneNumber - 1] || "" : "";
  medal.setAttribute("aria-hidden", "true");

  const laneTrack = document.createElement("div");
  laneTrack.className = "lane-track";
  laneTrack.setAttribute("aria-label", `Corsia di ${profile.name}, ${progress} ${progress === 1 ? "approccio riuscito" : "approcci riusciti"}`);
  const runway = document.createElement("div");
  runway.className = "race-runway";
  const runner = document.createElement("div");
  runner.className = "race-runner";

  if (profile.photo) {
    runner.append(createAvatar(profile, "race-photo"));
  } else {
    const noPhoto = document.createElement("span");
    noPhoto.className = "race-photo avatar-fallback";
    noPhoto.setAttribute("aria-label", `Nessuna foto per ${profile.name}`);
    noPhoto.textContent = profile.name.trim().charAt(0).toUpperCase();
    runner.append(noPhoto);
  }

  const horse = document.createElement("span");
  horse.className = "horse";
  horse.setAttribute("aria-hidden", "true");
  const illustration = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  illustration.setAttribute("class", "horse-illustration");
  illustration.setAttribute("viewBox", "0 0 100 72");
  illustration.setAttribute("focusable", "false");
  illustration.innerHTML = [
    '<g class="horse-tail"><path d="M25 31 Q12 25 10 34 Q8 40 18 42" fill="none" stroke="#3a2824" stroke-width="4" stroke-linecap="round"/><path d="M15 34 Q7 39 14 44" fill="none" stroke="#3a2824" stroke-width="3" stroke-linecap="round"/></g>',
    '<path d="M22 33 Q27 24 44 25 L59 29 Q67 31 69 39 L62 46 Q44 50 27 44 Q21 40 22 33Z" fill="var(--horse-coat, #a75d35)" stroke="#63351f" stroke-width="1.8"/>',
    '<path d="M55 33 Q61 22 66 13 L76 9 Q83 12 84 17 L92 19 Q95 21 91 24 L83 25 Q79 22 75 25 L69 39Z" fill="var(--horse-coat, #a75d35)" stroke="#63351f" stroke-width="1.8" stroke-linejoin="round"/>',
    '<path d="M64 18 Q58 22 60 29 L64 29 Q66 22 72 20 L76 14 L72 12Z" fill="#30221f"/>',
    '<path d="M36 26 Q44 21 55 27 L59 34 Q50 32 42 35 L36 31Z" fill="#563c68" stroke="#352640" stroke-width="1.6"/>',
    '<path d="M38 32 Q47 35 56 34 L55 37 Q47 38 39 35Z" fill="#d9bd85" stroke="#624b31" stroke-width="1"/>',
    '<path d="M64 16 Q67 7 77 8 L81 11 Q74 12 71 19Z" fill="#3a2824"/><path d="M79 16 Q82 14 84 16" fill="none" stroke="#2f211e" stroke-width="2" stroke-linecap="round"/><circle cx="80" cy="15" r="1" fill="#fff"/>',
    '<path d="M70 13 Q77 11 82 16 L87 19" fill="none" stroke="#ead3a7" stroke-width="1.3"/><path d="M86 19 L91 21" fill="none" stroke="#ead3a7" stroke-width="1.2"/>',
    '<g class="horse-legs horse-legs-back"><path d="M31 41 Q29 49 30 57 L26 65 M41 43 Q42 50 40 57 L44 65" fill="none" stroke="#63351f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 66 L29 66 M42 66 L47 66" stroke="#29231f" stroke-width="3" stroke-linecap="round"/></g>',
    '<g class="horse-legs horse-legs-front"><path d="M56 41 Q55 49 57 57 L54 65 M65 40 Q68 47 67 55 L71 64" fill="none" stroke="#63351f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M52 66 L57 66 M69 65 L74 65" stroke="#29231f" stroke-width="3" stroke-linecap="round"/></g>',
  ].join("");
  horse.append(illustration);
  runner.append(horse);
  runway.append(runner);
  laneTrack.append(runway);
  lane.append(
    medal,
    laneTrack,
    createProgressLabel(progress === previousProgress ? progress : previousProgress),
  );
  return lane;
}

function createProgressLabel(progress) {
  const label = document.createElement("span");
  label.className = "progress-count";
  label.textContent = String(progress);
  label.setAttribute("aria-label", `${progress} ${progress === 1 ? "approccio riuscito" : "approcci riusciti"}`);
  return label;
}

function renderActiveProfile() {
  activeProfileContainer.replaceChildren();
  activeProfileContainer.append(createAvatar(activeProfile, "active-avatar"));

  const details = document.createElement("div");
  details.className = "active-profile-details";
  const title = document.createElement("span");
  title.textContent = "Sfida in corso";
  const name = document.createElement("strong");
  name.textContent = activeProfile.name;
  details.append(title, name);
  activeProfileContainer.append(details);
}

function getRaceProgress(profileId) {
  return raceProgress[profileId] || 0;
}

function getRunnerPosition(progress, track, runner, maxProgress) {
  return Math.max(0, track.clientWidth - runner.offsetWidth) *
    Math.min(progress / Math.max(maxProgress, 1), 1);
}

function positionRaceRunners(advanceProfileId = "", previousProgress = 0) {
  const maxProgress = Math.max(
    1,
    ...raceRoster.map((profile) => getRaceProgress(profile.id)),
  );
  raceRoster.forEach((profile, index) => {
    const lane = raceTrack.children[index];
    const track = lane.querySelector(".lane-track");
    const runner = lane.querySelector(".race-runner");
    const progress = profile.id === advanceProfileId
      ? previousProgress
      : getRaceProgress(profile.id);
    runner.style.left = `${getRunnerPosition(progress, track, runner, maxProgress)}px`;
  });
  return maxProgress;
}

function createLeaderboardColumn(profile, index, chartMaxCount) {
  const stats = getProfileOutcomeStats(profile.id);
  const column = document.createElement("div");
  column.className = "leaderboard-column";
  column.setAttribute("role", "listitem");
  column.setAttribute(
    "aria-label",
    `${index + 1}. ${profile.name}: ${stats.successes} ${stats.successes === 1 ? "approccio riuscito" : "approcci riusciti"} e ${stats.rejections} ${stats.rejections === 1 ? "palo" : "pali"}`,
  );

  const bars = document.createElement("div");
  bars.className = "leaderboard-bars";
  [
    { count: stats.successes, type: "is-success" },
    { count: stats.rejections, type: "is-rejection" },
  ].forEach(({ count, type }) => {
    const metric = document.createElement("div");
    metric.className = "leaderboard-metric";

    const score = document.createElement("strong");
    score.className = "leaderboard-score";
    score.textContent = String(count);

    const bar = document.createElement("span");
    bar.className = `leaderboard-bar ${type}${count ? "" : " is-empty"}`;
    bar.style.setProperty(
      "--bar-height",
      `${count ? Math.max(12, count / chartMaxCount * 100) : 0}%`,
    );
    bar.setAttribute("aria-hidden", "true");

    metric.append(score, bar);
    bars.append(metric);
  });

  const name = document.createElement("span");
  name.className = "leaderboard-name";
  name.textContent = `${["🥇", "🥈", "🥉"][index] || `${index + 1}.`} ${profile.name}`;

  column.append(bars, name);
  return column;
}

function getLeaderboardMaxCount(chartProfiles) {
  return Math.max(
    1,
    ...chartProfiles.flatMap((profile) => {
      const stats = getProfileOutcomeStats(profile.id);
      return [stats.successes, stats.rejections];
    }),
  );
}

function renderGroup({ advanceProfileId = "", previousProgress = 0 } = {}) {
  participantList.replaceChildren(...groupPeople.map(createParticipantCard));
  participantCount.textContent = `${groupPeople.length} ${groupPeople.length === 1 ? "approccio" : "approcci"}`;
  emptyState.hidden = groupPeople.length > 0;
  const rankedProfiles = [...profiles].sort((profileA, profileB) => {
    const statsA = getProfileOutcomeStats(profileA.id);
    const statsB = getProfileOutcomeStats(profileB.id);
    if (Boolean(statsA.attempts) !== Boolean(statsB.attempts)) {
      return statsA.attempts ? -1 : 1;
    }
    const scoreDifference = getRaceProgress(profileB.id) - getRaceProgress(profileA.id);
    if (scoreDifference !== 0) return scoreDifference;
    const rateA = statsA.attempts ? statsA.successes / statsA.attempts : 0;
    const rateB = statsB.attempts ? statsB.successes / statsB.attempts : 0;
    return rateB - rateA || profileA.name.localeCompare(profileB.name);
  });
  const leaderStats = rankedProfiles.length ? getProfileOutcomeStats(rankedProfiles[0].id) : null;
  const leaderRate = leaderStats?.attempts
    ? leaderStats.successes / leaderStats.attempts
    : 0;
  raceRoster = rankedProfiles;
  raceSection.hidden = raceRoster.length === 0;
  const chartProfiles = rankedProfiles
    .filter((profile) => getProfileOutcomeStats(profile.id).attempts > 0);
  const topChartProfiles = chartProfiles.slice(0, 3);
  leaderboardChart.hidden = topChartProfiles.length === 0;
  fullLeaderboardButton.hidden = chartProfiles.length <= 3;
  const topChartMaxCount = getLeaderboardMaxCount(topChartProfiles);
  const fullChartMaxCount = getLeaderboardMaxCount(chartProfiles);
  leaderboardChart.replaceChildren(...topChartProfiles.map(
    (profile, index) => createLeaderboardColumn(profile, index, topChartMaxCount),
  ));
  fullLeaderboardChart.style.setProperty("--chart-column-count", chartProfiles.length);
  fullLeaderboardChart.replaceChildren(...chartProfiles.map(
    (profile, index) => createLeaderboardColumn(profile, index, fullChartMaxCount),
  ));
  raceTrack.replaceChildren(...raceRoster.map((profile, index) => {
    const progress = getRaceProgress(profile.id);
    const stats = getProfileOutcomeStats(profile.id);
    const successRate = stats.attempts ? stats.successes / stats.attempts : 0;
    const isLeader = Boolean(leaderStats && leaderStats.successes > 0 &&
      stats.successes === leaderStats.successes && successRate === leaderRate);
    return createRaceLane(
      profile,
      index + 1,
      progress,
      profile.id === advanceProfileId ? previousProgress : progress,
      isLeader,
    );
  }));
  const maxProgress = positionRaceRunners(advanceProfileId, previousProgress);
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = raceRunning;
  });
  switchProfileButton.disabled = raceRunning;

  if (advanceProfileId) {
    const laneIndex = raceRoster.findIndex((profile) => profile.id === advanceProfileId);
    const lane = raceTrack.children[laneIndex];
    const track = lane.querySelector(".lane-track");
    const runner = lane.querySelector(".race-runner");
    const progressLabel = lane.querySelector(".progress-count");
    const previousPosition = getRunnerPosition(previousProgress, track, runner, maxProgress);
    const currentPosition = getRunnerPosition(
      getRaceProgress(advanceProfileId),
      track,
      runner,
      maxProgress,
    );
    progressLabel.classList.add("is-counting");
    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = shouldReduceMotion
      ? null
      : runner.animate(
        [{ left: `${previousPosition}px` }, { left: `${currentPosition}px` }],
        { duration: 850, easing: "cubic-bezier(0.22, 0.72, 0.3, 1)", fill: "both" },
      );
    lane.classList.toggle("is-advancing", !shouldReduceMotion);

    if (!animation) {
      runner.style.left = `${currentPosition}px`;
      progressLabel.textContent = String(getRaceProgress(advanceProfileId));
      progressLabel.setAttribute("aria-label", `${getRaceProgress(advanceProfileId)} ${getRaceProgress(advanceProfileId) === 1 ? "approccio riuscito" : "approcci riusciti"}`);
      progressLabel.classList.remove("is-counting");
      return;
    }

    const animationCompletion = Promise.race([
      animation.finished.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);

    raceRunning = true;
    raceTrack.classList.add("is-racing");
    renderGroupControls();
    animationCompletion.then(() => {
      animation.cancel();
      progressLabel.textContent = String(getRaceProgress(advanceProfileId));
      progressLabel.setAttribute("aria-label", `${getRaceProgress(advanceProfileId)} ${getRaceProgress(advanceProfileId) === 1 ? "approccio riuscito" : "approcci riusciti"}`);
      progressLabel.classList.remove("is-counting");
      lane.classList.remove("is-advancing");
      raceRunning = false;
      raceTrack.classList.remove("is-racing");
      positionRaceRunners();
      renderGroupControls();
    }).catch(() => {
      animation.cancel();
      progressLabel.classList.remove("is-counting");
      lane.classList.remove("is-advancing");
      raceRunning = false;
      raceTrack.classList.remove("is-racing");
      positionRaceRunners();
      renderGroupControls();
    });
  }
}

function renderGroupControls() {
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = raceRunning;
  });
  openApproachFormButton.disabled = raceRunning;
  switchProfileButton.disabled = raceRunning;
}

async function refreshRemoteState() {
  if (!activeProfile || window.location.protocol === "file:" || firebaseDatabase || raceRunning) return;

  try {
    const [remoteProfiles, remoteGroup] = await Promise.all([
      readRemoteJson("/api/profiles"),
      readRemoteJson("/api/group"),
    ]);
    if (!Array.isArray(remoteProfiles)) {
      throw new Error("La lista dei profili ricevuta dal server non è valida.");
    }
    const normalizedState = normalizeSharedGroupState(remoteGroup);
    const profilesChanged = JSON.stringify(remoteProfiles) !== JSON.stringify(profiles);
    const groupChanged = JSON.stringify(normalizedState) !== JSON.stringify({
      people: groupPeople,
      progress: raceProgress,
    });

    if (profilesChanged) {
      profiles = remoteProfiles;
      saveProfiles(profiles);
      populateProfileSelects();
      const refreshedProfile = profiles.find((profile) => profile.id === activeProfile.id);
      if (refreshedProfile) {
        activeProfile = refreshedProfile;
        renderActiveProfile();
      } else {
        localStorage.removeItem(activeProfileStorageKey);
        activeProfile = null;
        groupPeople = [];
        raceProgress = {};
        groupApp.hidden = true;
        accessPanel.hidden = false;
        accessForm.reset();
        updateAccessFields();
        accessMessage.textContent = "Il profilo attivo è stato eliminato da un altro partecipante.";
      }
    }
    if (groupChanged) {
      applySharedGroupState(normalizedState, { notify: true });
    }
    lastSyncError = "";
  } catch (error) {
    const errorText = error instanceof Error ? error.message : "Non è stato possibile aggiornare i dati.";
    if (errorText !== lastSyncError) {
      message.textContent = errorText;
      lastSyncError = errorText;
    }
  }
}

async function enterProfile(profile) {
  let savedGroup;
  try {
    savedGroup = await loadGroupFromServer();
    localStorage.setItem(activeProfileStorageKey, profile.id);
  } catch (error) {
    accessMessage.textContent = error instanceof Error
      ? error.message
      : "Non è stato possibile ricordare il profilo su questo dispositivo.";
    return;
  }

  activeProfile = profile;
  groupPeople = savedGroup;
  nextId = groupPeople.reduce((next, person) =>
    typeof person.id === "number" ? Math.max(next, person.id + 1) : next, 1);
  accessPanel.hidden = true;
  groupApp.hidden = false;
  accessMessage.textContent = "";
  message.textContent = "";
  renderActiveProfile();
  startFirebaseGroupListener();
  populateProfileSelects();
  renderGroup();
}

window.setInterval(() => {
  void refreshRemoteState();
}, 2500);

window.addEventListener("resize", () => {
  if (activeProfile && !raceRunning) positionRaceRunners();
});

function resetPersonForm() {
  form.reset();
  editingPersonId = "";
  approachStep.textContent = "AGGIUNGI UN APPROCCIO";
  approachTitle.textContent = "Com'è andato?";
  approachSubmitButton.textContent = "Aggiungi al diario";
  outcomeButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
  starRatingGroups.forEach(updateStarRating);
}

function openPersonEditor(person) {
  if (!canEditPerson(person)) {
    message.textContent = "Puoi modificare solo gli approcci che hai aggiunto.";
    return;
  }

  resetPersonForm();
  editingPersonId = String(person.id);
  nameInput.value = person.name || "";
  form.elements.age.value = person.age || "";
  form.elements.hairColor.value = person.hairColor || "";
  outcomeButtons.forEach((button) => {
    const selected = button.dataset.outcome === person.palo;
    button.setAttribute("aria-pressed", String(selected));
  });
  form.elements.palo.value = person.palo || "";
  ["shoeRating", "glassesRating", "finalRating"].forEach((field) => {
    const input = form.querySelector(`input[name="${field}"][value="${person[field]}"]`);
    if (input) input.checked = true;
  });
  starRatingGroups.forEach(updateStarRating);
  approachStep.textContent = "MODIFICA APPROCCIO";
  approachTitle.textContent = "Modifica approccio";
  approachSubmitButton.textContent = "Salva modifiche";
  message.textContent = "";
  approachDialog.showModal();
  nameInput.focus();
}

function updateStarRating(group) {
  const selected = Number(group.querySelector("input:checked")?.value || 0);
  group.querySelectorAll("label").forEach((label) => {
    label.classList.toggle("is-filled", Number(label.dataset.value) <= selected);
  });
}

function initializeStarRatings() {
  starRatingGroups.forEach((group) => {
    const name = group.dataset.ratingName;
    const label = group.dataset.ratingLabel;
    for (let halfStep = 1; halfStep <= 10; halfStep += 1) {
      const value = halfStep / 2;
      const inputId = `${name}-${halfStep}`;
      const input = document.createElement("input");
      input.className = "star-rating-input";
      input.type = "radio";
      input.name = name;
      input.id = inputId;
      input.value = String(value);
      input.setAttribute("aria-label", `${label}: ${value} su 5 stelle`);

      const choice = document.createElement("label");
      choice.htmlFor = inputId;
      choice.dataset.value = String(value);
      choice.className = halfStep % 2 === 1 ? "star-choice star-half" : "star-choice star-full";
      choice.title = `${value} su 5 stelle`;
      choice.setAttribute("aria-hidden", "true");
      choice.textContent = "★";
      input.addEventListener("change", () => updateStarRating(group));
      group.append(input, choice);
    }
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", label);
    group.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
    updateStarRating(group);
  });
}

initializeStarRatings();

starRatingGroups.forEach((group) => {
  group.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const selected = group.querySelector("input:checked");
      if (selected) {
        selected.checked = false;
        updateStarRating(group);
      }
    }
  });
});

outcomeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    form.elements.palo.value = button.dataset.outcome;
    outcomeButtons.forEach((choice) => {
      choice.setAttribute("aria-pressed", String(choice === button));
    });
  });
});

function compressPhoto(file) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Scegli un file immagine valido."));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("La foto deve essere più piccola di 8 MB."));
  }

  return createImageBitmap(file).then((bitmap) => {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("Non è stato possibile elaborare la foto in questo browser.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.78);
  }).catch((error) => {
    if (error instanceof Error && error.message.startsWith("La foto ")) throw error;
    throw new Error("Non è stato possibile aprire la foto. Scegli un'altra immagine.");
  });
}

for (const choice of accessForm.querySelectorAll('input[name="access-type"]')) {
  choice.addEventListener("change", updateAccessFields);
}

if ("BroadcastChannel" in window) {
  sharedGroupChannel = new BroadcastChannel(sharedGroupChannelName);
  sharedGroupChannel.addEventListener("message", (event) => {
    const payload = event.data;
    if (payload && typeof payload === "object") {
      applySharedGroupState(payload, { notify: true });
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== sharedGroupStorageKey || !event.newValue) return;
  try {
    const parsedState = JSON.parse(event.newValue);
    applySharedGroupState(parsedState, { notify: true });
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Non è stato possibile aggiornare il gruppo.";
  }
});

async function initializeApp() {
  try {
    if (hasFirebaseConfig()) {
      await initializeFirebase();
      adminDashboardLink.hidden = false;
      profiles = loadProfiles();
      populateProfileSelects();
      startFirebaseListeners();
      return;
    } else if (window.location.hostname.endsWith(".github.io")) {
      throw new Error("Firebase non è ancora configurato. Completa la configurazione di firebase-config.js e attiva Firestore.");
    }

    profiles = loadProfiles();
    populateProfileSelects();

    if (window.location.protocol !== "file:") {
      const remoteProfiles = await readRemoteJson("/api/profiles");
      if (!Array.isArray(remoteProfiles)) {
        throw new Error("La lista dei profili ricevuta dal server non è valida.");
      }
      profiles = remoteProfiles;
      saveProfiles(remoteProfiles);
      populateProfileSelects();
    }

    const rememberedProfileId = localStorage.getItem(activeProfileStorageKey);
    const rememberedProfile = profiles.find((profile) => profile.id === rememberedProfileId);
    if (rememberedProfile) {
      await enterProfile(rememberedProfile);
    } else if (rememberedProfileId) {
      localStorage.removeItem(activeProfileStorageKey);
    }
  } catch (error) {
    accessMessage.textContent = error instanceof Error
      ? error.message
      : "Non è stato possibile leggere i profili salvati.";
  }
}

initializeApp();

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessMessage.textContent = "";
  const accessType = accessForm.elements["access-type"].value;

  if (accessType === "returning") {
    const profile = profiles.find((savedProfile) => savedProfile.id === savedProfileSelect.value);
    if (!profile) {
      accessMessage.textContent = profiles.length
        ? "Seleziona un profilo salvato per continuare."
        : "Non ci sono ancora profili salvati. Seleziona il primo accesso per crearne uno.";
      return;
    }
    await enterProfile(profile);
    return;
  }

  if (accessType !== "new") {
    accessMessage.textContent = "Scegli se hai già un profilo oppure se è il tuo primo accesso.";
    return;
  }

  const name = profileNameInput.value.trim();
  if (!name) {
    accessMessage.textContent = "Scrivi il tuo nome prima di continuare.";
    profileNameInput.focus();
    return;
  }

  accessSubmit.disabled = true;
  accessSubmit.textContent = "Salvataggio…";
  try {
    const photoFile = profilePhotoInput.files[0];
    const photo = photoFile ? await compressPhoto(photoFile) : "";
    const profile = {
      id: crypto.randomUUID(),
      name,
      photo,
    };
    const savedProfile = await saveRemoteProfile(profile);
    const profileToAdd = savedProfile || profile;
    const updatedProfiles = profiles.some((savedProfile) => savedProfile.id === profileToAdd.id)
      ? profiles
      : [...profiles, profileToAdd];
    saveProfiles(updatedProfiles);
    populateProfileSelects();
    await enterProfile(profileToAdd);
  } catch (error) {
    accessMessage.textContent = error instanceof Error
      ? error.message
      : "Non è stato possibile salvare il profilo. Controlla lo spazio disponibile nel browser.";
  } finally {
    accessSubmit.disabled = false;
    accessSubmit.textContent = "Continua";
  }
});

savedProfileSelect.addEventListener("change", () => {
  deleteProfileButton.disabled = !savedProfileSelect.value ||
    !canDeleteRecords();
  accessMessage.textContent = "";
});

deleteProfileButton.addEventListener("click", async () => {
  const profile = profiles.find((savedProfile) => savedProfile.id === savedProfileSelect.value);
  if (!profile) {
    accessMessage.textContent = "Seleziona il profilo da eliminare.";
    return;
  }
  if (!canDeleteRecords()) {
    accessMessage.textContent = "L'eliminazione non è disponibile in questa modalità.";
    return;
  }
  if (!window.confirm(`Eliminare il profilo di ${profile.name}? Verranno cancellati anche i suoi approcci e punti. Questa azione non si può annullare.`)) {
    return;
  }

  deleteProfileButton.disabled = true;
  deleteProfileButton.textContent = "Eliminazione…";
  accessMessage.textContent = "";
  try {
    const result = await deleteRemoteProfile(profile.id);
    if (result && result.group) {
      persistDeletedProfileGroup(result.group);
      localStorage.removeItem(groupStorageKey(profile.id));
    } else {
      removeProfileDataFromLocalGroup(profile.id);
    }
    const updatedProfiles = profiles.filter((savedProfile) => savedProfile.id !== profile.id);
    saveProfiles(updatedProfiles);
    if (localStorage.getItem(activeProfileStorageKey) === profile.id) {
      localStorage.removeItem(activeProfileStorageKey);
    }
    populateProfileSelects();
    accessMessage.textContent = `Il profilo di ${profile.name} e i suoi dati di gara sono stati eliminati.`;
  } catch (error) {
    accessMessage.textContent = error instanceof Error
      ? error.message
      : "Non è stato possibile eliminare il profilo.";
  } finally {
    deleteProfileButton.textContent = "Elimina il profilo selezionato";
    deleteProfileButton.disabled = !savedProfileSelect.value;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  if (!activeProfile) {
    message.textContent = "Accedi al tuo profilo prima di aggiungere persone.";
    return;
  }

  const outcome = form.elements.palo.value;
  if (outcome !== "No" && outcome !== "Sì") {
    message.textContent = "Scegli l'esito dell'approccio.";
    form.elements.palo.focus();
    return;
  }
  const personName = nameInput.value.trim();
  if (!personName) {
    message.textContent = "Scrivi un nome prima di continuare.";
    nameInput.focus();
    return;
  }

  const editingPerson = editingPersonId
    ? groupPeople.find((savedPerson) => String(savedPerson.id) === editingPersonId)
    : null;
  if (editingPersonId && (!editingPerson || !canEditPerson(editingPerson))) {
    message.textContent = "Puoi modificare solo gli approcci che hai aggiunto.";
    return;
  }

  const isEditing = Boolean(editingPerson);
  const successfulApproach = outcome === "No";
  const readStarRating = (field) => {
    const value = form.querySelector(`input[name="${field}"]:checked`)?.value;
    return value ? Number(value) : undefined;
  };
  const shoeRating = readStarRating("shoeRating");
  const glassesRating = readStarRating("glassesRating");
  const finalRating = readStarRating("finalRating");
  const person = {
    ...(editingPerson || {}),
    id: editingPerson?.id || (window.location.protocol === "file:" ? nextId : crypto.randomUUID()),
    name: personName,
    profileId: editingPerson?.profileId || activeProfile.id,
    hairColor: form.elements.hairColor.value.trim(),
    age: form.elements.age.value,
    rating: 0,
    palo: outcome,
  };
  ["shoeRating", "glassesRating", "finalRating"].forEach((field) => {
    const rating = { shoeRating, glassesRating, finalRating }[field];
    if (rating) person[field] = rating;
    else delete person[field];
  });

  try {
    const previousProgress = raceProgress[person.profileId] || 0;
    const updatedPeople = isEditing
      ? groupPeople.map((savedPerson) =>
        String(savedPerson.id) === editingPersonId ? person : savedPerson
      )
      : [...groupPeople, person];
    await saveGroup(updatedPeople);
    if (!isEditing) nextId += 1;
    raceResult.textContent = "";
    resetPersonForm();
    raceResult.textContent = isEditing
      ? "Modifiche salvate."
      : successfulApproach
        ? `Bel colpo, ${activeProfile.name}: un punto in più!`
        : `${activeProfile.name}: niente da fare, si rispetta il no e si va avanti.`;
    renderGroup(!isEditing && successfulApproach
      ? { advanceProfileId: activeProfile.id, previousProgress }
      : {});
    approachDialog.close();
  } catch (error) {
    message.textContent = error instanceof Error
      ? error.message
      : "Non è stato possibile salvare il gruppo. Controlla lo spazio disponibile nel browser.";
  }
});

openApproachFormButton.addEventListener("click", () => {
  resetPersonForm();
  message.textContent = "";
  approachDialog.showModal();
  nameInput.focus();
});

closeApproachFormButton.addEventListener("click", () => {
  approachDialog.close();
});

fullLeaderboardButton.addEventListener("click", () => {
  leaderboardDialog.showModal();
});

closeLeaderboardDialogButton.addEventListener("click", () => {
  leaderboardDialog.close();
});

approachDialog.addEventListener("close", () => {
  if (editingPersonId) resetPersonForm();
  openApproachFormButton.focus();
});

switchProfileButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(activeProfileStorageKey);
  } catch (error) {
    message.textContent = error instanceof Error
      ? error.message
      : "Non è stato possibile cambiare partecipante.";
    return;
  }
  activeProfile = null;
  groupPeople = [];
  accessForm.reset();
  updateAccessFields();
  populateProfileSelects();
  groupApp.hidden = true;
  accessPanel.hidden = false;
  accessMessage.textContent = "";
  message.textContent = "";
});
