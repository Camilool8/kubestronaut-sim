## Question

Was ist bei einem Service der Unterschied zwischen port, targetPort und nodePort?

## Options

- Sie sind Synonyme
- port ist der Port des Service selbst
- Nur nodePort ist Pflicht
- port gehört zum Container, targetPort zum Node, nodePort zum Service

## Solution

**port ist der Port des Service selbst** ist die richtige Antwort: Der Client trifft `ClusterIP:port`; kube-proxy DNATet auf `podIP:targetPort`; exponiert der Typ Nodes, ist `nodePort` der externe Port jedes Nodes. port mit targetPort zu verwechseln ist eine häufige Ursache für "connection refused".
