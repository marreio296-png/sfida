(function () {
  function readAdminUid(snapshot) {
    if (!snapshot.exists()) return "";
    const data = snapshot.data();
    if (!data || typeof data.uid !== "string" || !data.uid) {
      throw new Error("Il documento amministratore Firebase non contiene un UID valido.");
    }
    return data.uid;
  }

  window.readFirebaseAdminUid = async function (sdk, database) {
    const adminReference = sdk.doc(database, "settings", "admin");
    const existingAdmin = await sdk.getDoc(adminReference);
    return readAdminUid(existingAdmin);
  };
})();
