## Question

kubectl exec zeigt eth0 UP mit richtiger IP, aber NICHTS geht rein oder raus. Auf dem Node zeigt `ip link` den veth-Peer im Zustand LOWERLAYERDOWN. Was heißt das?

## Options

- LOWERLAYERDOWN ist der Normalzustand
- Der Pod braucht mehr CPU
- DNS ist falsch konfiguriert
- Das andere Ende des veth-Paares

## Solution

**Das andere Ende des veth-Paares** ist die richtige Antwort: veth ist ein Kabel mit zwei Enden: Fällt das Host-Ende oder verlässt es die Bridge, verliert der Pod-Link seine physische Schicht — das "virtuelle Kabel" ist gezogen. Bridge/CNI prüfen und den Pod neu erstellen.
