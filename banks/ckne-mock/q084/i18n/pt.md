## Question

O que acontece com conexões novas para um ClusterIP cujo Service não tem NENHUM endpoint ready?

## Options

- São redirecionadas ao apiserver
- Rejeitadas imediatamente (REJECT → "connection refused")
- Ficam em fila no kernel até um pod subir
- Recebem HTTP 404 gerado pelo próprio kube-proxy

## Solution

**Rejeitadas imediatamente (REJECT → "connection refused")** é a resposta correta: kube-proxy instala uma regra de rejeição para Services sem endpoints — o cliente recebe "connection refused" imediato. Distinguir refused (sem endpoints/porta errada) de timeout (policy/rota/firewall) acelera muito o troubleshooting.
