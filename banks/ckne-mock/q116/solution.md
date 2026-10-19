**RequestAuthentication + AuthorizationPolicy requiring requestPrincipals** is correct: `RequestAuthentication` defines how to validate the token (issuer, JWKS keys); alone, it only rejects INVALID tokens. The `AuthorizationPolicy` with `requestPrincipals: ["*"]` is what requires a valid token to be present — the two layers (workload + user) complement each other.

Why the others are wrong:

- **Native NetworkPolicy with a dedicated jwt field** — native NetworkPolicy has no `jwt` field or any L7 awareness.
- **Basic Auth in a ConfigMap** — basic auth in a ConfigMap is a shared password in plain text — no identity, no expiry, no per-user claims.
- **Validation only in the frontend, before reaching the gateway** — validating only at the frontend leaves the service trusting whatever reaches it; a caller bypassing the frontend would be accepted.
