## Question

¿Cuándo debe utilizar TLS Passthrough (TLSRoute) en lugar de Terminate en el Gateway?

## Options

- Cuando el backend debe terminar TLS por sí mismo
- Cuando no hay ningún certificado disponible en el backend
- Passthrough solo sirve para UDP
- Siempre, porque es más rápido

## Solution

**Cuando el backend debe terminar TLS por sí mismo** es la respuesta correcta: En `Passthrough`, el Gateway solo lee el SNI del ClientHello y reenvía los bytes cifrados. Se pierde el enrutamiento por path/header (sin visibilidad L7), pero el certificado permanece bajo el control del backend.
