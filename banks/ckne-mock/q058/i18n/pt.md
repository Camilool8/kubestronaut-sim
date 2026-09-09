## Question

Qual comando mostra as entradas de rastreamento de conexão (NAT/estado) para investigar por onde uma conexão de pod está sendo traduzida?

## Options

- free -m
- lsof -i
- systemctl status conntrack
- conntrack -L | grep `<IP-do-pod>`

## Solution

**conntrack -L | grep `<IP-do-pod>`** é a resposta correta: `conntrack -L` lista a tabela de connection tracking do kernel: você vê a tupla original (pod→ClusterIP) e a traduzida (pod→endpoint) após o DNAT do kube-proxy — essencial para confirmar se o NAT de Service está acontecendo.
