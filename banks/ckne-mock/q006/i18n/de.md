## Question

Um einem Pod ein zweites Netzwerk-Interface zu geben (z. B. eine dedizierte NIC für Storage-Traffic) — welche Lösung und welche Ressource?

## Options

- Zwei Services auf denselben Pod zeigen lassen
- Multus CNI mit einer NetworkAttachmentDefinition und der Annotation k8s.v1.cni.cncf.io/networks am Pod
- hostNetwork: true am Pod aktivieren
- kubectl expose mit --interfaces=2 für eine zweite verwaltete NIC

## Solution

**Multus CNI mit einer NetworkAttachmentDefinition und der Annotation k8s.v1.cni.cncf.io/networks am Pod** ist die richtige Antwort: `Multus` agiert als Meta-CNI: Es behält das Default-Netzwerk und ergänzt weitere Interfaces (net1, net2 …), definiert über `NetworkAttachmentDefinition`-CRDs (macvlan, SR-IOV, bridge …), ausgewählt per Pod-Annotation.
