## Question

Quais campos essenciais compõem um recurso Certificate do cert-manager?

## Options

- key, cert e ca em texto plano
- host, path e backend
- secretName, dnsNames e issuerRef
- image, replicas e ports

## Solution

**secretName, dnsNames e issuerRef** é a resposta correta: O Certificate declara o desejado; o cert-manager emite via `issuerRef`, grava chave+cert no Secret `secretName` e renova automaticamente. O Gateway/Ingress então só referencia o Secret.
