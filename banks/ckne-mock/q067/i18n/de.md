## Question

Zwischen zwei Pods funktioniert ping (ICMP), aber TCP-Verbindungen auf Port 8080 scheitern. Die zwei wahrscheinlichsten Ursachen?

## Options

- Eine restriktive L4-NetworkPolicy oder ein MTU/PMTUD-Problem
- ICMP ist im Kernel beider Nodes deaktiviert
- DNS ist im Namespace des Pods ausgefallen
- Der Pod braucht Root-Rechte

## Solution

**Eine restriktive L4-NetworkPolicy oder ein MTU/PMTUD-Problem** ist die richtige Antwort: Kleines ICMP passiert Pfade, die große Pakete verwerfen (MTU), und Policies behandeln Protokolle unterschiedlich. Mit `nc -zv` testen, kleine vs. große Payloads vergleichen (hängt `curl` bei größeren Dateien?) und L4-Policies prüfen.
