## Question

Zwei Container DESSELBEN Pods versuchen, auf Port 8080 zu lauschen. Was passiert?

## Options

- Es funktioniert: Jeder Container hat sein eigenes Netns
- Das Kubelet erzeugt eine zweite IP
- Der Traffic wird zwischen ihnen balanciert
- Der zweite scheitert mit "address already in use"

## Solution

**Der zweite scheitert mit "address already in use"** ist die richtige Antwort: Das Netns gehört der Sandbox (pause-Container); alle Container des Pods teilen es — deshalb funktioniert localhost zwischen ihnen und Ports kollidieren.
