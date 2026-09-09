## Question

Welche Rolle spielt in der Gateway API Inference Extension die Ressource InferenceModel (bzw. InferenceObjective)?

## Options

- Das Modell im Cluster trainieren
- Den Modellnamen auf einen InferencePool abbilden, mit Criticality
- Definieren, wie viele GPUs jeder Node dem Scheduler meldet
- Das Deployment des Modell-Servers ersetzen

## Solution

**Den Modellnamen auf einen InferencePool abbilden, mit Criticality** ist die richtige Antwort: `InferenceModel` verknüpft den logischen Modellnamen (was der Client anfragt) mit dem `InferencePool`, definiert Criticality (Priorisierung/Shedding unter Last) und erlaubt Canary zwischen Modellversionen/Adaptern.
