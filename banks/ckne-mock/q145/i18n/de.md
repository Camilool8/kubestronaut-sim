## Question

Was matcht eine HTTPRoute, die OHNE jegliche matches deklariert wurde?

## Options

- Nichts — matches ist Pflicht
- Alles auf dem Hostname/Listener
- Nur GET /
- Nur HTTPS

## Solution

**Alles auf dem Hostname/Listener** ist die richtige Antwort: Ohne explizite matches wird `PathPrefix /` angenommen — eine Catch-all-Route. Kombiniert mit den Präzedenzregeln (spezifischste gewinnt) erklärt ein verirrtes Catch-all viele "warum hat DIESE Route bedient?"-Fälle.
