## Question

Während eines Rollouts kommen neue Pods als ready ins EndpointSlice und erhalten SOFORT Traffic, liefern aber ~3 s lang 502. Die readinessProbe besteht. Wo ist die Falle?

## Options

- Die Probe prüft etwas Oberflächliches, bevor die App bereit ist
- kube-proxy ist immer zu langsam
- EndpointSlices haben eine Pflicht-Verzögerung von 3 s
- 502 ist bei Rollouts normal

## Solution

**Die Probe prüft etwas Oberflächliches, bevor die App bereit ist** ist die richtige Antwort: "Pod Endpoint Availability" hängt an der EHRLICHKEIT der Probe: Ein TCP-Check besteht mit offenem Socket und kalter App (Warm-up, DB-Verbindungen). Endpoints kommen sofort mit ready ins Balancing — die Probe ist der Vertrag (ein /ready, das Abhängigkeiten prüft).
