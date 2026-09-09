## Question

Warum haben Service-Mesh-Workload-Zertifikate (SVIDs) kurze Lebensdauern (z. B. 24 h) und rotieren automatisch?

## Options

- Um Plattenplatz auf den Nodes zu sparen
- Um tägliche Pod-Neustarts zu erzwingen
- Kurzes Fenster für geleakte Zertifikate, ohne Revocation-Abhängigkeit
- Weil TLS laut einer IETF-Norm zwingend nach 24 h abläuft

## Solution

**Kurzes Fenster für geleakte Zertifikate, ohne Revocation-Abhängigkeit** ist die richtige Antwort: Kurzes Leben = kurze Exposition: Ein geleaktes Zertifikat taugt Stunden, nicht Jahre, und Revocation (historisch kaputt: CRL/OCSP) wird unnötig. istio-agent/SPIRE erneuern SVIDs automatisch vor Ablauf, ohne Workload-Neustart.
