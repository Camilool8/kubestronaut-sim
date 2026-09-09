## Question

Was ist der standardisierte Weg, Traffic aus einem bestimmten Namespace nach NAME (z. B. "monitoring") in einer NetworkPolicy zu erlauben?

## Options

- ipBlock mit dem CIDR des Namespace
- Den Klartext-Namen in ein Feld from.namespace schreiben
- namespaceSelector mit dem Label kubernetes.io/metadata.name
- Auswahl nach Name ist unmöglich

## Solution

**namespaceSelector mit dem Label kubernetes.io/metadata.name** ist die richtige Antwort: Jeder Namespace bekommt automatisch das unveränderliche Label `kubernetes.io/metadata.name`. Damit lässt sich im namespaceSelector nach Namen referenzieren, ohne manuelle Labels.
