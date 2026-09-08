## Question

¿Qué combinación proporciona a un pod una interfaz secundaria de rendimiento muy alto, con acceso casi directo a la NIC física (NFV/baja latencia)?

## Options

- Dos réplicas de kube-proxy
- Aumentar los requests de CPU
- hostPort + NodePort combinados en el mismo puerto físico
- Multus + SR-IOV CNI + device plugin, entregando VFs de la NIC al pod

## Solution

**Multus + SR-IOV CNI + device plugin, entregando VFs de la NIC al pod** es la respuesta correcta: SR-IOV divide la NIC física en Virtual Functions (VF) entregadas directamente al pod, evitando la pila del host; el device plugin administra la asignación y Multus conecta la interfaz. Es el patrón habitual en telco/NFV y workloads de baja latencia.
