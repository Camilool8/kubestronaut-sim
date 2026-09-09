## Question

Какой ресурс заменил объект Endpoints в качестве основного масштабируемого механизма отслеживания backends Service?

## Options

- EndpointSlice
- PodDisruptionBudget
- BackendConfig
- ServiceEntry

## Solution

**EndpointSlice** — правильный ответ: `EndpointSlice` делит endpoints на slices (по умолчанию до 100 endpoints в каждом), снижая стоимость обновлений для крупных Services и добавляя сведения о топологии (zone, node). Старый объект Endpoints сохраняется для совместимости.
