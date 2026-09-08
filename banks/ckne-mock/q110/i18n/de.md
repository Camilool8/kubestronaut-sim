## Question

Welche Istio-Ressource und welcher Modus erzwingen, dass ALLER von Workloads eines Namespace empfangene Traffic mTLS ist und Klartext abgelehnt wird?

## Options

- NetworkPolicy mit einem tls-Feld
- Gateway mit allowInsecure: false
- PeerAuthentication mit mtls.mode: STRICT
- DestinationRule mit tls: DISABLE

## Solution

**PeerAuthentication mit mtls.mode: STRICT** ist die richtige Antwort: `PeerAuthentication STRICT` (pro Namespace oder mesh-weit) lässt Sidecars/ztunnel nur mTLS akzeptieren. PERMISSIVE (Default) akzeptiert beides — gut für Migration, in Produktion aber zu schließen.
