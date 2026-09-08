## Question

Você faz ping para o ClusterIP de um Service e não há resposta, mas curl na porta do Service funciona perfeitamente. Por quê?

## Options

- ICMP exige NodePort
- O Service está quebrado e o curl usa cache
- VIPs são regras DNAT, sem interface para responder ICMP
- O firewall bloqueia curl

## Solution

**VIPs são regras DNAT, sem interface para responder ICMP** é a resposta correta: Pegadinha de troubleshooting: o VIP não está atribuído a nenhuma interface; iptables/IPVS/eBPF apenas traduzem `VIP:porta`. Teste Services com `nc -zv`/`curl`, nunca com ping.
