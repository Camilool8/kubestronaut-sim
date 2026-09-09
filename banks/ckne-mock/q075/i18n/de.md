## Question

Wozu dient publishNotReadyAddresses: true an einem Service?

## Options

- Auch NOT-ready-Pods in DNS/Endpoints aufnehmen
- Die livenessProbe ignorieren
- Den Service per LoadBalancer im Internet veröffentlichen
- Die Endpoints duplizieren

## Solution

**Auch NOT-ready-Pods in DNS/Endpoints aufnehmen** ist die richtige Antwort: Normalerweise landen nur ready Pods in DNS/Endpoints — aber ein sich formender etcd-/Cassandra-Cluster braucht gegenseitige Auflösung, BEVOR die Member ready sind (Henne-Ei). Dieses Feld, üblich an StatefulSet-Headless-Services, löst das.
