## Question

Какой механизм обеспечивает взаимную аутентификацию для каждого workload — криптографическую идентичность pod — с автоматическим mTLS, обычно через service mesh?

## Options

- Basic Auth на kubelet
- Общий пароль, распределённый через ConfigMap
- Admission plugin NodeRestriction у apiserver
- mTLS с автоматически выданными идентичностями SPIFFE/SVID

## Solution

**mTLS с автоматически выданными идентичностями SPIFFE/SVID** — правильный ответ: Meshes назначают каждому workload идентичность SPIFFE, например `spiffe://cluster/ns/sa/…`, в краткоживущих сертификатах X.509 (SVIDs), устанавливая автоматический mTLS на основе ServiceAccount, а не IP.
