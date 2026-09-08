## Question

Al utilizar Multus con redes secundarias en varios nodos, ¿por qué el IPAM whereabouts es preferible a host-local?

## Options

- Porque host-local requiere DHCP externo
- host-local asigna por nodo sin coordinación y puede duplicar IP
- Porque es más rápido en todas las operaciones CNI ADD y DEL
- Porque whereabouts solo admite IPv6

## Solution

**host-local asigna por nodo sin coordinación y puede duplicar IP** es la respuesta correcta: `host-local` mantiene el estado únicamente en el disco del nodo; dos nodos pueden entregar la misma IP en la red secundaria. `whereabouts` registra las asignaciones en CRD del cluster, garantizando la unicidad de todo el rango entre todos los nodos.
