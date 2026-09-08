## Question

O Service está correto (port 80 → targetPort 8080), endpoints ready, mas toda conexão dá "connection refused". Dentro do pod, `ss -tlnp` mostra o processo escutando em 127.0.0.1:8080. Qual é o problema?

## Options

- O kube-proxy caiu naquele nó
- A aplicação faz bind apenas em localhost
- Precisa de hostNetwork
- A porta 8080 é reservada pelo kubelet

## Solution

**A aplicação faz bind apenas em localhost** é a resposta correta: Pegadinha número 1 de "refused" com tudo aparentemente certo: bind em loopback. O DNAT entrega no IP do pod, onde ninguém escuta. `ss -tlnp` dentro do pod revela na hora.
