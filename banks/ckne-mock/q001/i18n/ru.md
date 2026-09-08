## Question

В каком каталоге kubelet по умолчанию ищет файлы конфигурации сети CNI?

## Options

- /etc/kubernetes/cni/
- /opt/cni/bin/
- /etc/cni/net.d/
- /var/lib/cni/conf/

## Solution

**/etc/cni/net.d/** — правильный ответ: Файлы конфигурации (*.conf / *.conflist) находятся в `/etc/cni/net.d/`. Двоичные файлы плагинов находятся в `/opt/cni/bin/`. Если каталог конфигурации пуст, узлы остаются в состоянии NotReady с ошибкой "cni plugin not initialized".
