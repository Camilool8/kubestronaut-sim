## Question

Der Gateway-Listener definiert hostname *.example.com, eine HTTPRoute deklariert hostnames [app.example.com, app.other.com]. Was passiert?

## Options

- Beide Hostnames funktionieren
- Nur die Schnittmenge wird bedient
- Das Gateway übernimmt app.other.com automatisch
- Die ganze Route wird abgelehnt

## Solution

**Nur die Schnittmenge wird bedient** ist die richtige Antwort: Die Listener↔Route-Bindung nutzt die Hostname-Schnittmenge: Nur mit dem Listener-Hostname kompatible Namen werden programmiert (app.example.com passt zum Wildcard; app.other.com wird ignoriert). Den Attach-Status mit `kubectl describe httproute` prüfen.
