## Question

Por que `ip netns list` no nó geralmente retorna vazio, mesmo com dezenas de pods rodando, e qual comando lista os namespaces de rede reais?

## Options

- Porque o comando foi descontinuado
- Runtimes não criam netns nomeados; use lsns -t net
- Porque é preciso ser root e usar sudo duas vezes
- Porque os pods não usam namespaces

## Solution

**Runtimes não criam netns nomeados; use lsns -t net** é a resposta correta: `ip netns` só enxerga netns nomeados (bind-mounted em /var/run/netns). Runtimes criam netns anônimos por processo; `lsns -t net` os lista com PIDs, permitindo `nsenter -t PID -n` para inspecionar.
