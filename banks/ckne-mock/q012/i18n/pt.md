## Question

Qual a principal vantagem do modo IPVS do kube-proxy em relação ao modo iptables?

## Options

- Suporte nativo a balanceamento L7 (HTTP) com inspeção de headers
- Complexidade O(1) no encaminhamento e algoritmos de balanceamento
- Não precisa do módulo conntrack
- Criptografa o tráfego entre pods

## Solution

**Complexidade O(1) no encaminhamento e algoritmos de balanceamento** é a resposta correta: No modo iptables, as regras crescem com o nº de Services e são avaliadas sequencialmente. O IPVS usa tabelas hash no kernel (lookup ~O(1)) e oferece round-robin, least-connections, source-hash. Ambos continuam sendo L4.
