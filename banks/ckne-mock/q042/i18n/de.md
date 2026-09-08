## Question

Wann sollte man TLS Passthrough (TLSRoute) statt Terminate am Gateway verwenden?

## Options

- Wenn das Backend TLS selbst terminieren muss
- Wenn am Backend kein Zertifikat verfügbar ist
- Passthrough ist nur für UDP
- Immer, weil es schneller ist

## Solution

**Wenn das Backend TLS selbst terminieren muss** ist die richtige Antwort: Bei `Passthrough` liest das Gateway nur das SNI aus dem ClientHello und leitet die verschlüsselten Bytes weiter. Man verliert Path-/Header-Routing (keine L7-Sicht), aber das Zertifikat bleibt beim Backend — für End-to-End-mTLS/Compliance.
