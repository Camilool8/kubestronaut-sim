## Question

Necesita reenviar todas las consultas del dominio interno corp.example.com al DNS corporativo 10.50.0.2. ¿Qué debe hacer en CoreDNS?

## Options

- Añadir un bloque de servidor al Corefile
- Editar /etc/hosts en cada nodo
- Crear un Service ExternalName llamado corp.example.com
- Añadir la zona al kubelet con --cluster-domain

## Solution

**Añadir un bloque de servidor al Corefile** es la respuesta correcta: El Corefile (ConfigMap `coredns` en kube-system) acepta varios bloques de servidor. Un bloque dedicado con el plugin `forward` crea un stub domain. Otros plugins útiles son `rewrite`, `hosts` y `log`.
