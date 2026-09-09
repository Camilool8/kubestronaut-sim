## Question

Quelle commande valide d'un coup pod-à-pod, pod-à-service, DNS, policies et (si activé) le chiffrement sur un cluster Cilium ?

## Options

- ping -c 1 8.8.8.8
- kubectl get all
- cilium delete --all
- cilium connectivity test

## Solution

**cilium connectivity test** est la bonne réponse : `cilium connectivity test` est le smoke test canonique post-install/upgrade : il déploie des workloads de test et exécute des dizaines de scénarios (hairpin, NodePort local/distant, policies L3–L7, DNS) avec rapport d'échecs — en nommant le scénario exact qui échoue.
