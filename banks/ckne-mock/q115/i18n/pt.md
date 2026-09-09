## Question

Qual recurso do Gateway API roteia conexões TLS pelo SNI SEM descriptografá-las, e a qual modo de listener ele se associa?

## Options

- TCPRoute com o campo tls: true habilitado
- HTTPRoute em modo Secure
- CertRoute com SNI automático
- TLSRoute, em listener TLS modo Passthrough

## Solution

**TLSRoute, em listener TLS modo Passthrough** é a resposta correta: O `TLSRoute` casa o SNI do ClientHello e encaminha o fluxo cifrado intacto ao backend (que termina o TLS). É o mecanismo para expor múltiplos serviços TLS fim-a-fim atrás de um único IP.
