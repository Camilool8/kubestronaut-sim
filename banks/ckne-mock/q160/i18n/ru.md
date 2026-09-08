## Question

PeerAuthentication установлен в режиме PERMISSIVE, dashboard показывает mTLS: enabled, и аудит считается пройденным. Каков скрытый риск?

## Options

- PERMISSIVE шифрует только половину пакетов
- STRICT нарушает TLS
- Риска нет, PERMISSIVE безопасен
- PERMISSIVE ТАКЖЕ принимает незашифрованный plaintext-трафик

## Solution

**PERMISSIVE ТАКЖЕ принимает незашифрованный plaintext-трафик** — правильный ответ: PERMISSIVE предназначен для миграции и принимает как mTLS, так и plaintext. Проверьте соединение от workload без sidecar: если оно проходит, enforcement отсутствует. Для обязательного mTLS установите STRICT на уровне namespace или workload.
