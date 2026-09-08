## Question

kubectl get svc mostra o Service, mas `kubectl get endpointslices -l kubernetes.io/service-name=meu-svc` não retorna endpoints. Causa mais comum?

## Options

- O ClusterIP está em uso por outro Service
- O CoreDNS precisa ser reiniciado
- O selector do Service não casa com as labels dos pods
- Falta a annotation de endpoints no Service

## Solution

**O selector do Service não casa com as labels dos pods** é a resposta correta: Service sem endpoints quase sempre indica mismatch entre `spec.selector` e as labels dos pods — ou pods em outro namespace, ou nenhum ready. Compare com `kubectl get pods --show-labels`.
