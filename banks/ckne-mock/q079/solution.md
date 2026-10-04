**requestHeaderModifier** is correct: The `RequestHeaderModifier` filter adds/sets/removes headers on the request path (there's also ResponseHeaderModifier). `URLRewrite` changes hostname/path; `RequestMirror` mirrors traffic to another backend.

Why the others are wrong:

- **corsPolicy** — CORS handling is not an HTTPRoute core filter; adding an arbitrary header is a header-modifier job.
- **urlRewrite** — URLRewrite changes the hostname or path of the request, not its headers.
- **requestMirror** — RequestMirror copies traffic to a second backend for observation; it does not alter the request sent to the primary.
