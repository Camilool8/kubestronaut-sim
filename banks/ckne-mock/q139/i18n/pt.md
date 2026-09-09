## Question

Durante debug, `kubectl port-forward svc/minha-api 8080:80` funciona, mas em produção os pods falham ao chamar o mesmo Service. Por que o port-forward NÃO valida o caminho real?

## Options

- Túnel direto a UM pod via apiserver, fora do caminho do Service
- Produção sempre usa outro cluster e outra imagem
- port-forward usa UDP
- port-forward é mais lento

## Solution

**Túnel direto a UM pod via apiserver, fora do caminho do Service** é a resposta correta: O túnel do port-forward não passa pelo datapath de Service. Ele pode funcionar com DNS quebrado, policies bloqueando e kube-proxy morto. Para validar o caminho real, teste de DENTRO de um pod.
