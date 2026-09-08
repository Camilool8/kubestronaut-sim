## Question

Por padrão, quando um pod acessa um destino fora do cluster, qual transformação o tráfego sofre ao sair do nó?

## Options

- Nenhuma — o IP do pod é sempre roteável na internet
- É convertido para IPv6
- SNAT/masquerade: o IP de origem vira o IP do nó
- O tráfego é bloqueado por padrão

## Solution

**SNAT/masquerade: o IP de origem vira o IP do nó** é a resposta correta: CNIs aplicam masquerade para destinos fora dos CIDRs do cluster: o servidor externo enxerga o IP do nó. Isso é ajustável (ex.: `ip-masq-agent` com nonMasqueradeCIDRs) quando os pod IPs são roteáveis na rede da empresa.
