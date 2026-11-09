# No Sign-in / No Text-Highlight Confirmation — V1.1.0

NEXORA V1.1.0 does not add authentication, login, accounts, credentials, registration, a PIN, or an HTTP authentication challenge. The existing no-sign-in access model is preserved.

NEXORA V1.1.0 also does not add custom text-selection highlighting or disable normal browser text selection. Native browser selection and copying remain available.

The lack of in-app authentication means a publicly reachable Cloudflare Tunnel hostname can expose the routes intentionally served by the application. This is documented as an infrastructure/security risk; this release does not add sign-in against the user's explicit requirement.
