## Question

Quel est le test le plus rapide pour valider d'un coup le DNS et la connectivité de base d'un nouveau cluster ?

## Options

- ping 8.8.8.8 depuis votre machine
- kubectl get nodes -o wide avec INTERNAL-IP et version
- kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default
- kubectl top pods --containers sur tout kube-system

## Solution

**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** est la bonne réponse : Ce one-liner crée un pod, résout `kubernetes.default` (exerçant resolv.conf, search domains, CoreDNS et le Service kube-dns) et se supprime en sortant. Un échec ici pointe directement le sous-système DNS/CNI.
