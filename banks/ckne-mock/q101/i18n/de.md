## Question

Wie ist die Standard-Netzwerkhaltung zwischen Pods in einem Cluster OHNE angewandte NetworkPolicy?

## Options

- Nur Traffic innerhalb desselben Namespace ist erlaubt
- Nur TCP-Traffic ist erlaubt
- Alles standardmäßig blockiert
- Alles erlaubt zwischen beliebigen Pods (allow-any-any)

## Solution

**Alles erlaubt zwischen beliebigen Pods (allow-any-any)** ist die richtige Antwort: Das Kubernetes-Netzwerkmodell ist per Default offen: Ohne Policies gibt es keinerlei Isolation. Daher die Best Practice, mit Default-Deny pro Namespace zu starten und Nötiges explizit zu erlauben.
