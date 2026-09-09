## Question

Sie haben ein gewichtetes Canary (90/10) UND eine Regel, die den Header x-beta: true nach v2 routet. Ein Nutzer mit x-beta: true landet manchmal auf v1. Was prüfen?

## Options

- Der Browser entfernt Header
- Die Gateway API unterstützt keine Header-Matches
- Ob der Header-Match in DERSELBEN Rule wie die Gewichte steht
- Gewichte schlagen immer Header

## Solution

**Ob der Header-Match in DERSELBEN Rule wie die Gewichte steht** ist die richtige Antwort: Strukturfalle: Header-Canary verlangt eine eigene, spezifischere Regel (Header-Match), die VOR der reinen Gewichts-Regel greift; letztere bleibt Fallback. Alles in einer Rule vermischt ergibt eine gewichtete Lotterie für alle.
