## Question

Was muss für einen Dual-Stack-Cluster (IPv4 + IPv6) konfiguriert werden?

## Options

- Nur das CNI tauschen
- Dual-Stack wird in Kubernetes nicht unterstützt
- Nur AAAA-Records in CoreDNS ergänzen
- cluster-cidr und service-cluster-ip-range mit zwei Blöcken

## Solution

**cluster-cidr und service-cluster-ip-range mit zwei Blöcken** ist die richtige Antwort: Dual-Stack verlangt doppelte CIDRs in der Control Plane, ein kompatibles CNI und pro Service das Feld `ipFamilyPolicy` (SingleStack, PreferDualStack, RequireDualStack) + `ipFamilies`. Pods erhalten je Familie eine IP in `status.podIPs`.
