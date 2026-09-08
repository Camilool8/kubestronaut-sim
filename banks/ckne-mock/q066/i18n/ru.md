## Question

Какой самый быстрый тест одновременно проверяет DNS и базовую связность нового кластера?

## Options

- ping 8.8.8.8 с вашей машины
- kubectl get nodes -o wide с проверкой INTERNAL-IP и версии
- kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default
- kubectl top pods --containers во всём kube-system

## Solution

**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** — правильный ответ: Этот one-liner создаёт pod, разрешает `kubernetes.default`, проверяя resolv.conf, search domains, CoreDNS и Service kube-dns, а затем удаляет pod при выходе. Сбой сразу указывает на подсистему DNS/CNI.
