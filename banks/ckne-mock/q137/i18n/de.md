## Question

Ein ExternalName-Service zeigt auf api.partner.com und Clients rufen https://mein-alias.default.svc.cluster.local. TLS scheitert. Warum?

## Options

- CoreDNS blockiert TLS
- Der Typ ExternalName unterstützt weder HTTPS noch TLS-Passthrough
- Es fehlt ein NodePort für Port 443
- Das Zertifikat des Ziels lautet auf api.partner.com (SAN-Mismatch)

## Solution

**Das Zertifikat des Ziels lautet auf api.partner.com (SAN-Mismatch)** ist die richtige Antwort: TLS-Falle: Validiert wird der Name, den der CLIENT angefragt hat — der interne Hostname passt nicht zum Zertifikat (SNI/SAN-Mismatch). Fix: den echten Namen aufrufen, SNI/Verifikation korrekt konfigurieren oder ein Proxy, der Host/SNI umschreibt.
