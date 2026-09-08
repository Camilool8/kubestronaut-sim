## Question

Чтобы все запросы одного клиента всегда попадали в один и тот же pod через ClusterIP, какую настройку Service следует использовать?

## Options

- publishNotReadyAddresses: true
- topologyKeys
- externalTrafficPolicy: Local
- sessionAffinity: ClientIP

## Solution

**sessionAffinity: ClientIP** — правильный ответ: `sessionAffinity: ClientIP` сохраняет привязку по исходному IP с параметром `timeoutSeconds`, по умолчанию 3 часа. Это единственная встроенная affinity L4; привязка по cookie требует proxy L7, например Ingress/Gateway.
