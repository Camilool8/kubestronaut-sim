## Question

Что добавляет AdminNetworkPolicy (ANP) по сравнению с традиционной NetworkPolicy?

## Options

- Firewall только для интернета
- Заменяет RBAC для сетевого трафика
- Cluster scope, priority и actions Allow/Deny/Pass
- Ничего; это только новое имя NetworkPolicy

## Solution

**Cluster scope, priority и actions Allow/Deny/Pass** — правильный ответ: ANP предоставляет администраторам guardrails, которые пользователи не могут переопределить, например запрет egress к cloud metadata. BANP задаёт cluster default, если пользовательская policy не приняла решение. Порядок: ANP → NetworkPolicy → BANP.
