## Question

Endpoints Service верны, прямое соединение pod-to-pod по IP работает, но доступ через ClusterIP не работает из всех pods одного конкретного узла. Что является главным подозреваемым?

## Options

- Все replicas CoreDNS недоступны
- kube-proxy на этом узле не работает или не запрограммировал rules
- Namespace удаляется в background
- Неверный container image

## Solution

**kube-proxy на этом узле не работает или не запрограммировал rules** — правильный ответ: ClusterIP материализуется НА КАЖДОМ УЗЛЕ через iptables/IPVS/eBPF. Если только один узел не достигает VIP, нарушено локальное программирование: kube-proxy упал, rules не синхронизированы или конфликтует local firewall. Сравните `iptables-save` между узлами.
