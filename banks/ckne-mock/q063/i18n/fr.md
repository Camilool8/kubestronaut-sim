## Question

Quelle combinaison donne à un pod une interface secondaire très performante, avec accès quasi direct à la NIC physique (NFV/basse latence) ?

## Options

- Deux répliques de kube-proxy
- Augmenter les requests CPU
- hostPort + NodePort combinés sur le même port physique
- Multus + SR-IOV CNI + device plugin, livrant les VFs de la NIC au pod

## Solution

**Multus + SR-IOV CNI + device plugin, livrant les VFs de la NIC au pod** est la bonne réponse : SR-IOV divise la NIC physique en Virtual Functions (VFs) remises directement au pod (en contournant la pile de l'hôte) ; le device plugin gère l'allocation et Multus attache l'interface — standard en télécom/NFV et workloads basse latence.
