## Question

При отладке `kubectl port-forward svc/my-api 8080:80` работает, но production-pod не могут вызвать тот же Service. Почему port-forward НЕ проверяет реальный сетевой путь?

## Options

- Он создаёт прямой туннель через apiserver к ОДНОМУ pod, минуя путь Service
- Production всегда использует другой кластер и image
- port-forward использует UDP
- port-forward просто медленнее

## Solution

**Он создаёт прямой туннель через apiserver к ОДНОМУ pod, минуя путь Service** — правильный ответ: Туннель port-forward обходит datapath Service. Он может работать при сломанном DNS, блокирующей policy и неработающем kube-proxy. Реальный путь нужно проверять изнутри другого pod.
