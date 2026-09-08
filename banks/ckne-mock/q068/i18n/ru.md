## Question

Почему `ip netns list` на узле обычно возвращает пустой список даже при десятках работающих pods и какая команда показывает реальные сетевые namespaces?

## Options

- Команда устарела
- Runtimes не создают именованные netns; используйте lsns -t net
- Нужно быть root и дважды использовать sudo
- Pods не используют namespaces

## Solution

**Runtimes не создают именованные netns; используйте lsns -t net** — правильный ответ: `ip netns` видит только именованные netns, bind-mounted в /var/run/netns. Runtimes создают анонимные netns процессов; `lsns -t net` выводит их с PID, после чего можно использовать `nsenter -t PID -n`.
