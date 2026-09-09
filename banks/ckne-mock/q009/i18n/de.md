## Question

Was tut die Container-Runtime laut CNI-Spezifikation, wenn ein Pod erstellt wird?

## Options

- Sendet ein NetworkRequest-CRD an den Apiserver
- Schreibt direkt in die Routingtabellen des Pod-Netns
- Ruft die REST-API des CNI-Plugins über HTTPS auf
- Führt das Plugin-Binary mit CNI_COMMAND=ADD aus, Config via stdin

## Solution

**Führt das Plugin-Binary mit CNI_COMMAND=ADD aus, Config via stdin** ist die richtige Antwort: CNI ist ein Binary-Kontrakt: Die Runtime startet das Plugin mit Env-Variablen wie `CNI_COMMAND=ADD`, `CNI_NETNS`, `CNI_IFNAME` und der JSON-Config via stdin. Das Plugin liefert JSON mit IPs/Routen zurück. DEL wird beim Entfernen aufgerufen.
