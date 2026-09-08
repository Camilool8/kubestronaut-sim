## Question

Welche Gateway-API-Ressource routet TLS-Verbindungen per SNI OHNE Entschlüsselung, und mit welchem Listener-Modus ist sie verknüpft?

## Options

- TCPRoute mit aktiviertem Feld tls: true
- HTTPRoute im Secure-Modus
- CertRoute mit automatischem SNI
- TLSRoute, an einem TLS-Listener im Passthrough-Modus

## Solution

**TLSRoute, an einem TLS-Listener im Passthrough-Modus** ist die richtige Antwort: `TLSRoute` matcht das SNI des ClientHello und leitet den verschlüsselten Stream intakt ans Backend (das TLS terminiert). Der Mechanismus, um mehrere End-to-End-TLS-Dienste hinter einer IP zu exponieren.
