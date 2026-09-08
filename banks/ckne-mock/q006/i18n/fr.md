## Question

Pour donner à un pod une deuxième interface réseau (ex. une NIC dédiée au trafic de stockage), quelle solution et quelle ressource ?

## Options

- Créer deux Services pointant vers le même pod
- Multus CNI avec une NetworkAttachmentDefinition et l'annotation k8s.v1.cni.cncf.io/networks sur le pod
- Activer hostNetwork: true sur le pod
- kubectl expose avec --interfaces=2 pour générer une seconde NIC gérée

## Solution

**Multus CNI avec une NetworkAttachmentDefinition et l'annotation k8s.v1.cni.cncf.io/networks sur le pod** est la bonne réponse : `Multus` agit comme méta-CNI : il conserve le réseau par défaut et ajoute des interfaces (net1, net2…) définies par des CRD `NetworkAttachmentDefinition` (macvlan, SR-IOV, bridge…), choisies via annotation du pod.
