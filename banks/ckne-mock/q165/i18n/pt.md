## Question

Qual comando valida de uma só vez conectividade pod-a-pod, pod-a-service, DNS, policies e (se habilitado) criptografia num cluster com Cilium?

## Options

- ping -c 1 8.8.8.8
- kubectl get all
- cilium delete --all
- cilium connectivity test

## Solution

**cilium connectivity test** é a resposta correta: O `cilium connectivity test` é o smoke test canônico pós-instalação/upgrade: cobre casos que testes manuais esquecem (hairpin, NodePort local/remoto, policies L3-L7, DNS) e aponta o cenário exato que falhou.
