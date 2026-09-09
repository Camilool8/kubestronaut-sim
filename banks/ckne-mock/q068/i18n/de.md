## Question

Warum liefert `ip netns list` auf dem Node meist nichts, obwohl Dutzende Pods laufen — und welcher Befehl listet die echten Netzwerk-Namespaces?

## Options

- Weil der Befehl deprecated wurde
- Runtimes erzeugen keine benannten netns; nutze lsns -t net
- Weil man zweimal root sein und sudo nutzen muss
- Weil Pods keine Namespaces nutzen

## Solution

**Runtimes erzeugen keine benannten netns; nutze lsns -t net** ist die richtige Antwort: `ip netns` sieht nur benannte netns (Bind-Mounts in /var/run/netns). Runtimes (containerd/CRI-O) erzeugen anonyme Prozess-Netns; `lsns -t net` listet sie mit PIDs — dann `nsenter -t PID -n` zur Inspektion.
