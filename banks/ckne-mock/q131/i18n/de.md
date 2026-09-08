## Question

TCP über VXLAN scheitert bizarr (Handshake OK, Daten korrupt/hängend). Bekannter Workaround: `ethtool -K flannel.1 tx-checksum-ip-generic off`. Was ist das Grundproblem?

## Options

- Der Kernel unterstützt kein TCP
- Speicher ist knapp
- MTU immer zu hoch
- Checksum-Offload des Treibers rechnet mit VXLAN falsch

## Solution

**Checksum-Offload des Treibers rechnet mit VXLAN falsch** ist die richtige Antwort: Ein Produktionsklassiker: Checksum-Offload am VXLAN-Interface erzeugt auf bestimmten Kernel/Treiber-Kombinationen ungültige Prüfsummen — innere Pakete kommen defekt an. Offload am vtep abschalten behebt es und erklärt "Ping geht, die App hängt".
