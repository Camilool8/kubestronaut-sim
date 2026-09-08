## Question

Para un cluster dual-stack (IPv4 + IPv6), ¿qué se debe configurar?

## Options

- Solo cambiar el CNI
- Kubernetes no admite dual-stack
- Únicamente añadir registros AAAA a CoreDNS
- cluster-cidr y service-cluster-ip-range con dos bloques

## Solution

**cluster-cidr y service-cluster-ip-range con dos bloques** es la respuesta correcta: Dual-stack requiere CIDR dobles en el control plane, un CNI compatible y, para cada Service, el campo `ipFamilyPolicy` (SingleStack, PreferDualStack, RequireDualStack) más `ipFamilies`. Los pods reciben una IP de cada familia en `status.podIPs`.
