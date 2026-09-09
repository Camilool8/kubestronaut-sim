## Question

Чтобы предоставить pod второй сетевой интерфейс, например выделенную NIC для storage-трафика, какое решение и ресурс используются?

## Options

- Создать два Services, указывающих на один pod
- Multus CNI с NetworkAttachmentDefinition и annotation k8s.v1.cni.cncf.io/networks у pod
- Включить hostNetwork: true у pod
- kubectl expose с --interfaces=2 для создания управляемой второй NIC

## Solution

**Multus CNI с NetworkAttachmentDefinition и annotation k8s.v1.cni.cncf.io/networks у pod** — правильный ответ: `Multus` работает как метаплагин CNI: сохраняет сеть по умолчанию и добавляет дополнительные интерфейсы (net1, net2…), определённые CRD `NetworkAttachmentDefinition` (macvlan, SR-IOV, bridge и т. д.), которые выбираются annotation у pod.
