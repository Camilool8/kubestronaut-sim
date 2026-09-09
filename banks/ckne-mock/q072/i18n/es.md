## Question

¿Cuál es el backend más reciente de kube-proxy, creado para sustituir el modo iptables con mejor rendimiento y una API de kernel más moderna?

## Options

- socketd
- ebtables
- nftables
- tc

## Solution

**nftables** es la respuesta correcta: El modo `nftables` (GA en Kubernetes 1.33) utiliza la API sucesora de iptables, con actualizaciones de reglas más eficientes y mejor rendimiento en clusters con muchos Services. eBPF (Cilium) sigue siendo la alternativa fuera de kube-proxy.
