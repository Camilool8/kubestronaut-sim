## Question

В multi-primary Istio multi-cluster mesh workloads кластера A не доверяют сертификатам кластера B и получают TLS-ошибки. Какое требование идентичности забыто?

## Options

- Общий root CA или trust domain
- Одинаковый namespace в обоих кластерах
- Временное отключение mTLS между кластерами
- Публичные IP для каждого pod

## Solution

**Общий root CA или trust domain** — правильный ответ: Федеративная идентичность требует общего корня доверия. Если каждый кластер самостоятельно создал свой CA, получаются два изолированных trust island. Выпускайте intermediate CA от одного root CA или используйте federation SPIRE до объединения mesh.
