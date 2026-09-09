## Question

Sie haben einen Service gelöscht und namensgleich neu erstellt. Apps mit gemerkter alter IP brachen. Welche Architektur-Lektion bestätigt das?

## Options

- Die alte IP kommt in 24 h zurück
- Man sollte direkt die Pod-IP nutzen
- Services können nicht neu erstellt werden
- ClusterIPs ändern sich bei jeder Neuanlage des Service

## Solution

**ClusterIPs ändern sich bei jeder Neuanlage des Service** ist die richtige Antwort: Die IP wird bei Erstellung dynamisch aus dem Service-Range vergeben (außer spec.clusterIP pinnt sie). Der stabile Kubernetes-Kontrakt ist der NAME. Auf App-Seite verdient DNS-Caching (JVM!) nach Neuanlagen Aufmerksamkeit.
