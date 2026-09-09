## Question

В multi-cluster topology Istio с отдельными networks без прямой pod-to-pod связности какой компонент передаёт service-трафик между кластерами?

## Options

- Отдельный NodePort для каждого service во всех кластерах
- Выделенный east-west gateway публикует services между кластерами через mTLS
- Постоянный kubectl port-forward
- VPN на ноутбуках разработчиков

## Solution

**Выделенный east-west gateway публикует services между кластерами через mTLS** — правильный ответ: Когда pods разных кластеров не могут напрямую связаться, Istio направляет cross-cluster трафик через east-west gateways — выделенный LoadBalancer — сохраняя mTLS и единое обнаружение endpoints между networks.
