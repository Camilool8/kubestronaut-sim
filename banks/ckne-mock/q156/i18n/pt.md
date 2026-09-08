## Question

Um pod com hostNetwork: true acessa pods protegidos por NetworkPolicy que só permite determinados podSelectors — e o acesso FUNCIONA. Por quê?

## Options

- hostNetwork ativa um modo administrativo de rede
- NetworkPolicies têm um bug conhecido com TCP keepalive
- A policy só vale para TCP, e o acesso usa UDP
- O tráfego dele origina do IP do NÓ, não de um pod IP com identidade

## Solution

**O tráfego dele origina do IP do NÓ, não de um pod IP com identidade** é a resposta correta: Pods hostNetwork são "o nó" para a rede. Muitos CNIs tratam IPs de nós de forma especial (probes do kubelet precisam passar). Resultado: policies baseadas em pod identity não o restringem como esperado — cuidado com o que roda em hostNetwork.
