## Question

Para permitir tráfego do pod frontend (10.244.3.7) você criou uma regra ipBlock com 10.244.3.7/32. Funcionou hoje e quebrou amanhã. Por quê?

## Options

- ipBlock expira em 24h e precisa ser renovado
- O CIDR /32 é inválido em regras de NetworkPolicy
- O frontend precisa de hostNetwork para ser selecionado
- IPs de pods são efêmeros e podem chegar SNAT-eados; use selectors

## Solution

**IPs de pods são efêmeros e podem chegar SNAT-eados; use selectors** é a resposta correta: Policies entre workloads devem usar identidade (labels), não endereços. A própria documentação restringe ipBlock a IPs externos ao cluster — o duplo risco: IP rotativo e NAT no caminho.
