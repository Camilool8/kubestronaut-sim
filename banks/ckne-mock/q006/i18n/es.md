## Question

Para proporcionar a un pod una segunda interfaz de red (por ejemplo, una NIC dedicada al tráfico de almacenamiento), ¿qué solución y recurso utiliza?

## Options

- Crear dos Services que apunten al mismo pod
- Multus CNI con un NetworkAttachmentDefinition y la annotation k8s.v1.cni.cncf.io/networks en el pod
- Habilitar hostNetwork: true en el pod
- kubectl expose con --interfaces=2 para generar una segunda NIC administrada

## Solution

**Multus CNI con un NetworkAttachmentDefinition y la annotation k8s.v1.cni.cncf.io/networks en el pod** es la respuesta correcta: `Multus` actúa como un meta-plugin CNI: mantiene la red predeterminada y añade interfaces adicionales (net1, net2…) definidas mediante CRD `NetworkAttachmentDefinition` (macvlan, SR-IOV, bridge, etc.), seleccionadas mediante una annotation del pod.
