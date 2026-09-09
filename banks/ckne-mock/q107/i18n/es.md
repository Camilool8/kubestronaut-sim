## Question

¿Qué añade AdminNetworkPolicy (ANP) en comparación con NetworkPolicy tradicional?

## Options

- Un firewall únicamente para internet
- Sustituye RBAC para el tráfico de red
- Alcance de cluster, prioridad y acciones Allow/Deny/Pass
- Nada; es solo un cambio de nombre de NetworkPolicy

## Solution

**Alcance de cluster, prioridad y acciones Allow/Deny/Pass** es la respuesta correcta: ANP proporciona guardrails administrativos que los usuarios no pueden sobrescribir (por ejemplo, "nunca permitir egress hacia cloud metadata") y BANP establece el valor predeterminado del cluster cuando ninguna policy de usuario decide. Orden: ANP → NetworkPolicy → BANP.
