(function () {
  const adminEmail = "emanuele.admin@sfida-554ff.firebaseapp.com";
  window.firebaseAdminEmail = adminEmail;
  window.isFirebaseAdminUser = function (user) {
    return Boolean(user?.email === adminEmail &&
      user.providerData.some((provider) => provider.providerId === "password"));
  };
})();
