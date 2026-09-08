## Question

Das Verfügbarkeits-SLO des Gateways ist 99,9 %/Monat. Welche Alerting-Strategie vermeidet Paging bei Mini-Blips UND zu spätes Erkennen langsamen Budget-Verbrauchs?

## Options

- Ein fester Alert bei 1 % Fehlern
- Multi-Window-Burn-Rate-Alerts (schnelles + langsames Fenster)
- Alerts nachts abschalten
- Bei jedem einzelnen Fehler alarmieren

## Solution

**Multi-Window-Burn-Rate-Alerts (schnelles + langsames Fenster)** ist die richtige Antwort: Burn Rate = Geschwindigkeit des Error-Budget-Verbrauchs. Kombinierte kurze+lange Fenster (z. B. 14,4x über 5 m/1 h und 1x über 6 h/3 d) fangen akute Vorfälle UND schleichende Degradierung, mit sehr wenigen False Positives — kanonische SRE-Praxis für Netz-SLOs.
