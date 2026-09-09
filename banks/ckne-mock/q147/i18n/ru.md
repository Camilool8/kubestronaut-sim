## Question

На bare metal вы создали Gateway, но его ADDRESS остаётся пустым, а Programmed: False — бесконечно. HTTPRoute корректны. Чего не хватает?

## Options

- Аннотации Gateway со static IP control-plane узла
- HTTPRoute должен быть создан раньше Gateway
- Провайдера VIP, например LB-IPAM или MetalLB, который выделит адрес
- Перезапуска apiserver

## Solution

**Провайдера VIP, например LB-IPAM или MetalLB, который выделит адрес** — правильный ответ: Причина та же, что у LoadBalancer в Pending: реализация Gateway запрашивает адрес, но в bare-metal среде никто его не предоставляет. LB-IPAM или MetalLB выделяют IP, а L2 либо BGP объявляют его в сети.
