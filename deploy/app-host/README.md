Empty on purpose: app.voidcat.io serves no files of its own. Firebase Hosting forwards every request to the
`voidcat-web` Cloud Run service (see `firebase.json`), which sends its own security headers.
