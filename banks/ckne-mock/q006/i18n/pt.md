## Question

Para dar a um pod uma segunda interface de rede (ex.: uma NIC dedicada para tráfego de storage), qual solução e recurso você usa?

## Options

- Criar dois Services apontando para o mesmo pod
- Multus CNI com um NetworkAttachmentDefinition e a annotation k8s.v1.cni.cncf.io/networks no pod
- Habilitar hostNetwork: true no pod
- kubectl expose com --interfaces=2 para gerar uma segunda NIC gerenciada

## Solution

**Multus CNI com um NetworkAttachmentDefinition e a annotation k8s.v1.cni.cncf.io/networks no pod** é a resposta correta: O `Multus` atua como meta-plugin CNI: mantém a rede padrão e adiciona interfaces extras (net1, net2…) definidas por CRDs `NetworkAttachmentDefinition` (macvlan, SR-IOV, bridge etc.), selecionadas via annotation no pod.
