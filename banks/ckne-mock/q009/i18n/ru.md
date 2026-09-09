## Question

Согласно спецификации CNI, что делает container runtime при создании pod?

## Options

- Отправляет CRD NetworkRequest в apiserver
- Непосредственно записывает маршруты в таблицы netns pod
- Вызывает REST API плагина CNI по HTTPS
- Запускает двоичный файл плагина с CNI_COMMAND=ADD, передавая конфигурацию через stdin

## Solution

**Запускает двоичный файл плагина с CNI_COMMAND=ADD, передавая конфигурацию через stdin** — правильный ответ: CNI — это контракт запуска двоичных файлов: runtime запускает плагин с переменными окружения, такими как `CNI_COMMAND=ADD`, `CNI_NETNS`, `CNI_IFNAME`, и передаёт JSON-конфигурацию через stdin. Плагин возвращает JSON с IP и маршрутами. При удалении вызывается DEL.
