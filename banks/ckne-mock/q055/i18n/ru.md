## Question

Если kubectl exec недоступен, как войти в сетевое пространство имён pod с узла для диагностики?

## Options

- Перезапустить kubelet с --debug-netns
- Изменить /etc/network/interfaces узла и перезагрузить конфигурацию
- Получить PID через crictl inspect, затем выполнить nsenter -t `<PID>` -n
- Подключиться по ssh прямо к IP pod

## Solution

**Получить PID через crictl inspect, затем выполнить nsenter -t `<PID>` -n** — правильный ответ: `crictl ps` и `crictl inspect --output go-template --template '{{.info.pid}}'` дают PID; `nsenter -t PID -n ip addr` или ss/tcpdump выполняет команды внутри netns pod, используя инструменты хоста.
