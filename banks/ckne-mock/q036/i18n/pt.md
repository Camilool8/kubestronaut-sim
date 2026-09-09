## Question

Como permitir egress de um pod apenas para a sub-rede 203.0.113.0/24, exceto o host 203.0.113.9?

## Options

- Adicionar o host no /etc/hosts como blackhole
- ipBlock não suporta exceções
- Duas policies separadas: uma allow e uma deny
- ipBlock com cidr 203.0.113.0/24 e except 203.0.113.9/32

## Solution

**ipBlock com cidr 203.0.113.0/24 e except 203.0.113.9/32** é a resposta correta: O `ipBlock` aceita `cidr` e uma lista `except`. Lembre-se: com qualquer policy de egress, todo o resto fica bloqueado — inclusive DNS; libere também as portas 53 para o kube-dns.
