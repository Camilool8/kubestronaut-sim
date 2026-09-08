## Question

Em um CNI em modo de roteamento nativo (sem encapsulamento), o que você espera ver em `ip route` no nó?

## Options

- Rotas para o podCIDR dos outros nós via IP do nó vizinho
- Rotas /32 para cada pod do cluster inteiro
- Nenhuma rota relacionada a pods
- Apenas a rota default apontando para o gateway físico

## Solution

**Rotas para o podCIDR dos outros nós via IP do nó vizinho** é a resposta correta: No modo direct/native routing, os pacotes não são encapsulados: cada nó precisa saber que o podCIDR do vizinho é alcançável via o IP do vizinho. Essas rotas são instaladas pelo CNI ou aprendidas via BGP. A ausência delas quebra o tráfego cross-node.
