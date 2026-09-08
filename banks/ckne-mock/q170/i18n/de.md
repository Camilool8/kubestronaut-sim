## Question

hubble observe zeigt Drops mit Verdict "Policy denied" in Richtung pod→kube-dns, NACHDEM Sie eine Egress-Policy auf den Namespace angewandt haben. Apps klagen über Namensauflösung. Korrekte Lesart des Flows?

## Options

- kube-dns hat die Ports gewechselt
- Das Flow-Log bestätigt die Root Cause
- CoreDNS ist abgestürzt und riss die Auflösung mit
- Hubble irrt sich bei dieser Art von Flow

## Solution

**Das Flow-Log bestätigt die Root Cause** ist die richtige Antwort: DROPPED-Flows Richtung kube-dns:53 direkt nach einer Egress-Policy = die unverwechselbare Signatur der vergessenen DNS-Regel (UDP/TCP 53 erlauben). Hubble macht aus "DNS ging mysteriös kaputt" sichtbare Ursache und Wirkung.
