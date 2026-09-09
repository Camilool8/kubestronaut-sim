## Question

Em um arquivo .conflist do CNI, qual é a função do array "plugins" com múltiplas entradas (ex.: cilium, portmap, bandwidth)?

## Options

- Escolher o plugin conforme o namespace do pod
- Rodar cada plugin em um nó diferente
- Definir plugins alternativos, usados só se o primeiro falhar
- Encadeamento (chaining): os plugins são executados em sequência

## Solution

**Encadeamento (chaining): os plugins são executados em sequência** é a resposta correta: CNI chaining executa os plugins em ordem: o primeiro (main) cria e configura a interface; os chained recebem o resultado anterior (prevResult) e agregam capacidades como `portmap` (hostPort) e `bandwidth` (annotations kubernetes.io/ingress-bandwidth).
