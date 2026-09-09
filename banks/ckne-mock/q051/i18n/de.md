## Question

Verbindungen scheitern unter Last sporadisch und dmesg zeigt "nf_conntrack: table full, dropping packet". Welche Metrik bestätigt das, und was ist der Fix?

## Options

- Ein CNI-Neustart behebt es dauerhaft
- node_nf_conntrack_entries mit node_nf_conntrack_entries_limit vergleichen
- apiserver_request_total beobachten; Apiserver skalieren
- coredns_cache_hits_total prüfen; CoreDNS-Cache leeren

## Solution

**node_nf_conntrack_entries mit node_nf_conntrack_entries_limit vergleichen** ist die richtige Antwort: Jede NAT-Verbindung belegt einen Conntrack-Eintrag. Volle Tabelle = stille Drops und sporadische Fehler. Das Verhältnis entries/limit im node_exporter überwachen und `net.netfilter.nf_conntrack_max` anheben.
