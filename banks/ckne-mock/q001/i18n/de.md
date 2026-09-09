## Question

In welchem Verzeichnis sucht das Kubelet standardmäßig nach CNI-Netzwerkkonfigurationsdateien?

## Options

- /etc/kubernetes/cni/
- /opt/cni/bin/
- /etc/cni/net.d/
- /var/lib/cni/conf/

## Solution

**/etc/cni/net.d/** ist die richtige Antwort: Die Konfigurationsdateien (*.conf / *.conflist) liegen in `/etc/cni/net.d/`, die Plugin-Binaries in `/opt/cni/bin/`. Ist das Config-Verzeichnis leer, bleiben Nodes NotReady mit dem Fehler "cni plugin not initialized".
