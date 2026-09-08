## Question

Ihre Pod-IPs sind im Rechenzentrum routbar, aber Traffic zum internen 10.0.0.0/8 verlässt den Node weiterhin SNATet. Wie erhalten Sie die Pod-IP für diese Ziele?

## Options

- hostNetwork auf allen Pods
- Den ip-masq-agent konfigurieren
- kube-proxy abschalten
- Ohne Service Mesh unmöglich

## Solution

**Den ip-masq-agent konfigurieren** ist die richtige Antwort: `ip-masq-agent` steuert Masquerading pro Ziel: In nonMasqueradeCIDRs gelistete Bereiche (10.0.0.0/8) verlassen den Node mit der Original-Pod-IP. CNIs haben Äquivalente (Cilium ipMasqAgent, Calico natOutgoing pro IPPool).
