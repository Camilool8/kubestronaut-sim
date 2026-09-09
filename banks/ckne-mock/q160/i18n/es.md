## Question

Con PeerAuthentication en modo PERMISSIVE (predeterminado), el dashboard muestra 'mTLS: enabled' y la auditoría se aprueba. ¿Cuál es el riesgo oculto?

## Options

- PERMISSIVE cifra solo la mitad de los paquetes
- STRICT rompe TLS
- Ninguno; PERMISSIVE es seguro
- PERMISSIVE TAMBIÉN acepta texto claro

## Solution

**PERMISSIVE TAMBIÉN acepta texto claro** es la respuesta correcta: Trampa de auditoría: PERMISSIVE existe para migraciones y acepta tanto mTLS COMO texto claro. Verifique con una conexión de prueba sin sidecar; si entra, no existe enforcement. Ciérrelo con STRICT por namespace.
