(() => {
  const adminEmail = "marreio296@gmail.com";
  window.firebaseAdminEmail = adminEmail;
  window.isFirebaseAdminUser = (user) => Boolean(
    user?.email === adminEmail &&
    user.providerData?.some((provider) => provider.providerId === "password"),
  );
})();
