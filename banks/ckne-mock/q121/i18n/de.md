## Question

Traffic eines Pods wird irgendwo im Kernel-Stack verworfen, unklar wo (iptables? tc? Route?). Welches eBPF-Tool zeigt den Paketpfad im Kernel samt Drop-Punkt?

## Options

- ein ausführliches kubectl describe pod
- df -h
- top
- pwru (packet, where are you?)

## Solution

**pwru (packet, where are you?)** ist die richtige Antwort: `pwru` (von Cilium) instrumentiert den Kernel mit eBPF und druckt die Reise des Pakets Funktion für Funktion (Netfilter-Hooks, Routen, tc) samt Drop-Ort/-Grund — löst Fälle, in denen tcpdump das Paket eingehen, aber nie ausgehen sieht.
