## Question

При использовании VXLAN и интерфейсов узла с MTU 1500 какая настройка предотвращает fragmentation или потерю крупных пакетов?

## Options

- MTU CNI с вычетом overhead tunnel, например 1450
- Уменьшить число replicas
- Увеличить MTU pods до 9000
- Отключить TCP и использовать в pods только UDP

## Solution

**MTU CNI с вычетом overhead tunnel, например 1450** — правильный ответ: Header VXLAN занимает около 50 bytes. Если pod отправляет frames размером 1500, инкапсулированный пакет превышает физический MTU и отбрасывается. Задайте MTU CNI через поле `mtu`/auto-detection равным 1450 или включите jumbo frames 9000 в физической сети.
