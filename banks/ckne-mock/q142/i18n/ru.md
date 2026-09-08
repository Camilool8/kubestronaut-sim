## Question

Какую DNS-запись Kubernetes создаёт для отдельного POD без Service и каков её формат?

## Options

- pod-name.cluster.local
- IP с дефисами: 10-244-1-5.default.pod.cluster.local
- pods.default.svc
- Для pod никогда не создаются записи

## Solution

**IP с дефисами: 10-244-1-5.default.pod.cluster.local** — правильный ответ: Формат `a-b-c-d.ns.pod.cluster.local` существует, но содержит сам IP и поэтому мало полезен для discovery. Для стабильного обнаружения pod используйте headless Service, обычно со StatefulSet.
