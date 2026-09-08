## Question

Для чего используется publishNotReadyAddresses: true у Service?

## Options

- Включать в DNS/endpoints также pods, которые ещё NOT ready
- Игнорировать livenessProbe
- Публиковать Service в интернете через LoadBalancer
- Дублировать endpoints

## Solution

**Включать в DNS/endpoints также pods, которые ещё NOT ready** — правильный ответ: Обычно в DNS/endpoints попадают только ready pods, но формирующемуся кластеру etcd/Cassandra нужно разрешать имена участников ДО готовности. Это поле, часто используемое у headless Services для StatefulSets, решает проблему chicken-and-egg.
