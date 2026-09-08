## Question

В чём различие между port, targetPort и nodePort в Service?

## Options

- Это синонимы
- port — собственный порт Service
- Обязателен только nodePort
- port принадлежит container, targetPort — узлу, nodePort — Service

## Solution

**port — собственный порт Service** — правильный ответ: Клиент обращается к `ClusterIP:port`; kube-proxy выполняет DNAT на `podIP:targetPort`; если тип публикует узлы, `nodePort` является внешним портом на каждом узле. Путаница port и targetPort часто вызывает «connection refused».
