## Question

Sobre o comportamento das NetworkPolicies, qual afirmação é correta?

## Options

- Policies exigem ordem de prioridade numérica
- A última policy aplicada sobrescreve as anteriores
- Policies são aditivas (allow-list)
- Policies funcionam mesmo sem suporte do CNI

## Solution

**Policies são aditivas (allow-list)** é a resposta correta: NetworkPolicies nativas só permitem: selecionar um pod o isola, e o liberado é a união de todas as policies. Não há deny explícito nem precedência — e o enforcement depende do CNI (Flannel puro ignora policies). CRDs do Cilium/Calico adicionam deny e prioridade.
