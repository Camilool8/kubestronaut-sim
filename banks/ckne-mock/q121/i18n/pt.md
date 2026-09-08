## Question

O tráfego de um pod está sendo dropado em algum ponto da pilha do kernel e você não sabe onde (iptables? tc? rota?). Qual ferramenta eBPF rastreia o caminho do pacote no kernel mostrando ONDE ele foi descartado?

## Options

- kubectl describe pod detalhado
- df -h
- top
- pwru (packet, where are you?)

## Solution

**pwru (packet, where are you?)** é a resposta correta: O `pwru` (da Cilium) instrumenta o kernel com eBPF e imprime a jornada do pacote função a função (netfilter hooks, rotas, tc), incluindo o motivo/local do drop — resolvendo casos em que tcpdump mostra o pacote entrando mas nunca saindo.
