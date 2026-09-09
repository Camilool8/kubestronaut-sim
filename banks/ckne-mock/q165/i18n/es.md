## Question

¿Qué comando valida de una vez conectividad pod-a-pod, pod-a-Service, DNS, policies y, si está habilitado, cifrado en un cluster Cilium?

## Options

- ping -c 1 8.8.8.8
- kubectl get all
- cilium delete --all
- cilium connectivity test

## Solution

**cilium connectivity test** es la respuesta correcta: `cilium connectivity test` es el smoke test canónico posterior a instalación/upgrade: cubre casos que las pruebas manuales olvidan (hairpin, NodePort local/remoto, policies L3–L7, DNS) e identifica exactamente el escenario que falla.
