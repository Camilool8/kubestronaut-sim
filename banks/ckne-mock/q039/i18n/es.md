## Question

¿Qué mecanismo proporciona autenticación mutua por workload (identidad criptográfica por pod) con mTLS automático, normalmente mediante un service mesh?

## Options

- Basic Auth en kubelet
- Una contraseña compartida distribuida en un ConfigMap
- El admission plugin NodeRestriction del apiserver
- mTLS con identidades SPIFFE/SVID emitidas automáticamente

## Solution

**mTLS con identidades SPIFFE/SVID emitidas automáticamente** es la respuesta correcta: Los meshes proporcionan a cada workload una identidad SPIFFE (por ejemplo, `spiffe://cluster/ns/sa/…`) mediante certificados X.509 de corta duración (SVID), estableciendo mTLS automático basado en ServiceAccount, no en la IP.
