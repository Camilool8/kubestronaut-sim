## Question

In einer HTTPRoute mit zwei backendRefs hat eines weight: 0. Was passiert mit diesem Backend?

## Options

- Bekommt trotzdem die Hälfte des Traffics
- Die Route wird abgelehnt
- weight: 0 ist ungültig
- Bekommt KEINE neuen Requests

## Solution

**Bekommt KEINE neuen Requests** ist die richtige Antwort: Gewicht null = Anteil 0 am Traffic. Absichtlich gültig: Das Backend bleibt "eingesteckt", sodass man Traffic sofort umschalten kann (0↔100), ohne die Routenstruktur zu ändern — Drain-/Vorbereitungs-Technik.
