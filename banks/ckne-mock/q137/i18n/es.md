## Question

Un Service ExternalName apunta a api.partner.com y los clientes llaman https://my-alias.default.svc.cluster.local. TLS falla. ¿Por qué?

## Options

- CoreDNS bloquea TLS
- El tipo ExternalName no admite HTTPS ni TLS passthrough
- Falta un NodePort que exponga el puerto 443
- El certificado del destino es para api.partner.com (SAN mismatch)

## Solution

**El certificado del destino es para api.partner.com (SAN mismatch)** es la respuesta correcta: Trampa TLS: la validación utiliza el nombre solicitado por el CLIENTE. Solución: llamar al nombre real, configurar correctamente SNI/verificación o utilizar un proxy que reescriba Host/SNI.
