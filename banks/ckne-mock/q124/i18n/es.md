## Question

¿Qué comando de Hubble muestra en tiempo real únicamente flujos DROPPED y la razón (por ejemplo, Policy denied)?

## Options

- hubble observe --verdict DROPPED
- kubectl logs cilium
- hubble encrypt --all --follow
- hubble delete flows --verdict ALL

## Solution

**hubble observe --verdict DROPPED** es la respuesta correcta: `hubble observe --verdict DROPPED` enumera cada drop con origen→destino, puerto y razón (Policy denied, CT: connection tracking, L3 no compatible…). Es la vía más rápida para descubrir qué NetworkPolicy está bloqueando un flujo.
