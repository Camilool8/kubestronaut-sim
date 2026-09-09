## Question

Was bewirkt das Feld internalTrafficPolicy: Local an einem Service?

## Options

- Blockiert sämtlichen Traffic von außerhalb des Clusters
- Ersetzt CoreDNS
- Liefert internen Traffic nur an Endpoints auf dem Node des Clients
- Aktiviert internes mTLS

## Solution

**Liefert internen Traffic nur an Endpoints auf dem Node des Clients** ist die richtige Antwort: Das interne Pendant zur externalTrafficPolicy: nützlich für Node-Daemons (Log-Agent, Node-Local-Cache), wo jeder Pod mit der Instanz des eigenen Nodes sprechen soll — spart Hops und Latenz. Ohne lokalen Endpoint wird der Traffic verworfen.
