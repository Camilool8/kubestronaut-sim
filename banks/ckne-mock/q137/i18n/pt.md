## Question

Um Service ExternalName aponta para api.parceiro.com e os clientes chamam https://meu-alias.default.svc.cluster.local. O TLS falha. Por quê?

## Options

- O CoreDNS bloqueia TLS
- O tipo ExternalName não suporta HTTPS nem TLS passthrough
- Falta NodePort para expor a porta 443
- O certificado do destino é de api.parceiro.com (SAN mismatch)

## Solution

**O certificado do destino é de api.parceiro.com (SAN mismatch)** é a resposta correta: Pegadinha de TLS: a validação usa o nome que o CLIENTE pediu. Solução: chamar pelo nome real, configurar SNI/verificação adequada, ou usar um proxy que reescreva o Host/SNI.
