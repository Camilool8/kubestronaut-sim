## Question

Alle Queries für die interne Domain corp.example.com sollen an den Firmen-DNS 10.50.0.2 gehen. Was tun Sie in CoreDNS?

## Options

- Einen Server-Block im Corefile ergänzen
- /etc/hosts auf jedem Node editieren
- Einen ExternalName-Service namens corp.example.com anlegen
- Die Zone dem Kubelet mit --cluster-domain hinzufügen

## Solution

**Einen Server-Block im Corefile ergänzen** ist die richtige Antwort: Das Corefile (ConfigMap `coredns` in kube-system) erlaubt mehrere Server-Blöcke. Ein eigener Block mit dem `forward`-Plugin (`corp.example.com:53 { forward . 10.50.0.2 }`) erzeugt eine Stub-Domain. Nützlich auch: `rewrite`, `hosts`, `log`.
