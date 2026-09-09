## Question

Welche CNI-Operation wird beim Löschen eines Pods aufgerufen — und was passiert, wenn der Node VORHER rebootet?

## Options

- CNI DEL; ohne sie bleiben IP-Leases verwaist im IPAM
- CNI FLUSH; etcd entfernt die IP
- Keine; der Kernel räumt immer alles selbst auf
- CNI REMOVE; nichts passiert

## Solution

**CNI DEL; ohne sie bleiben IP-Leases verwaist im IPAM** ist die richtige Antwort: Die Runtime ruft `CNI_COMMAND=DEL` beim Entfernen. Crashes können den Schritt überspringen — der Ursprung von Geister-Leases in `/var/lib/cni/networks` und des "no IP addresses available" Wochen später.
