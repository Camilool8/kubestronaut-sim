## Question

Mit PeerAuthentication im PERMISSIVE-Modus (Default) zeigt das Dashboard 'mTLS: enabled' und das Audit besteht. Was ist das versteckte Risiko?

## Options

- PERMISSIVE verschlüsselt nur die Hälfte der Pakete
- STRICT bricht TLS
- Keines, PERMISSIVE ist sicher
- PERMISSIVE akzeptiert AUCH Klartext

## Solution

**PERMISSIVE akzeptiert AUCH Klartext** ist die richtige Antwort: Audit-Falle: PERMISSIVE existiert für die Migration (akzeptiert mTLS UND Klartext) — jeder Client ohne Sidecar kommt unverschlüsselt rein; 'enabled' heißt nicht 'enforced'. Mit einer Testverbindung ohne Sidecar prüfen und per STRICT pro Namespace schließen.
