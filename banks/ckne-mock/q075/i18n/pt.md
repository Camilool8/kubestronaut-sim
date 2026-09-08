## Question

Para que serve publishNotReadyAddresses: true em um Service?

## Options

- Incluir no DNS/endpoints também os pods NOT ready
- Ignorar o livenessProbe
- Publicar o Service na internet via LoadBalancer
- Duplicar os endpoints

## Solution

**Incluir no DNS/endpoints também os pods NOT ready** é a resposta correta: Normalmente só pods ready entram no DNS/endpoints — mas um cluster etcd/Cassandra em formação precisa que os membros se resolvam ANTES de estarem ready (chicken-and-egg). Esse campo, comum em headless Services de StatefulSets, resolve isso.
