## Question

Welcher HTTPRoute-Filter fügt allen an das Backend weitergeleiteten Requests einen Header hinzu (z. B. X-Env: prod)?

## Options

- requestHeaderModifier
- corsPolicy
- urlRewrite
- requestMirror

## Solution

**requestHeaderModifier** ist die richtige Antwort: Der Filter `RequestHeaderModifier` (add/set/remove) wirkt auf dem Request-Pfad (analog ResponseHeaderModifier für Antworten). `URLRewrite` ändert Hostname/Pfad; `RequestMirror` spiegelt Traffic auf ein anderes Backend.
