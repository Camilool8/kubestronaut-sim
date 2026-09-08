## Question

Qual é o teste mais rápido para validar, de uma vez, DNS e conectividade básica de um novo cluster?

## Options

- ping 8.8.8.8 a partir da sua máquina
- kubectl get nodes -o wide conferindo INTERNAL-IP e versão
- kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default
- kubectl top pods --containers em kube-system inteiro

## Solution

**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** é a resposta correta: Esse one-liner cria um pod, resolve `kubernetes.default` (exercitando resolv.conf, search domains, CoreDNS e o Service kube-dns) e remove o pod ao sair. Falhas aqui apontam imediatamente para o subsistema DNS/CNI.
