## Question

Eine Default-Deny-Egress-Policy wurde angewandt und Pods lösen keine DNS-Namen mehr auf. Welche Minimalregel stellt die Auflösung wieder her?

## Options

- Ingress auf Port 443 erlauben
- Den kube-dns-Service neu anlegen
- Egress zu den kube-dns-Pods erlauben
- CoreDNS auf hostNetwork umziehen

## Solution

**Egress zu den kube-dns-Pods erlauben** ist die richtige Antwort: Mit Deny-All-Egress sind auch Queries an CoreDNS blockiert — klassisches Symptom: `could not resolve host` überall. UDP und TCP 53 erlauben (TCP für große/verkürzte Antworten): namespaceSelector kube-system + podSelector k8s-app=kube-dns.
