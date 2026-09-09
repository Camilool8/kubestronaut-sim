## Question

Welche Kombination gibt einem Pod ein sehr performantes Sekundär-Interface mit quasi-direktem Zugriff auf die physische NIC (NFV/Low Latency)?

## Options

- Zwei kube-proxy-Replikas
- Höhere CPU-Requests
- hostPort + NodePort kombiniert auf demselben physischen Port
- Multus + SR-IOV CNI + Device Plugin, das VFs der NIC an den Pod gibt

## Solution

**Multus + SR-IOV CNI + Device Plugin, das VFs der NIC an den Pod gibt** ist die richtige Antwort: SR-IOV teilt die physische NIC in Virtual Functions (VFs), die direkt an den Pod gehen (am Host-Stack vorbei); das Device Plugin verwaltet die Zuteilung, Multus hängt das Interface an — Standard in Telco/NFV und Low-Latency-Workloads.
