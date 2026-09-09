## Question

Cuando se elimina un pod, ¿qué operación CNI se llama y qué ocurre si el nodo se reinicia ANTES de ejecutarla?

## Options

- CNI DEL; sin ella, los leases de IP quedan huérfanos en IPAM
- CNI FLUSH; etcd elimina la IP
- Ninguna; el kernel siempre limpia todo por sí mismo
- CNI REMOVE; no ocurre nada

## Solution

**CNI DEL; sin ella, los leases de IP quedan huérfanos en IPAM** es la respuesta correcta: El runtime llama a `CNI_COMMAND=DEL` al eliminar el pod. Los fallos pueden omitir ese paso, origen de leases fantasma en `/var/lib/cni/networks` y del error "no IP addresses available" semanas después.
