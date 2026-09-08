## Question

Conexões falham intermitentemente sob carga e o dmesg do nó mostra "nf_conntrack: table full, dropping packet". Qual métrica confirma e qual a correção?

## Options

- Reiniciar o CNI resolve definitivamente
- Comparar node_nf_conntrack_entries com node_nf_conntrack_entries_limit
- Observar apiserver_request_total; escalar o apiserver
- Verificar coredns_cache_hits_total; limpar o cache do CoreDNS

## Solution

**Comparar node_nf_conntrack_entries com node_nf_conntrack_entries_limit** é a resposta correta: Cada conexão NAT-eada ocupa uma entrada conntrack. Tabela cheia = drops silenciosos e falhas intermitentes. Monitore a razão entries/limit no node_exporter e ajuste `nf_conntrack_max`.
