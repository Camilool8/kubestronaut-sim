## Question

IP pods маршрутизируются в datacenter, но трафик к внутренней сети 10.0.0.0/8 всё равно выходит с SNAT на IP узла. Как сохранить исходный IP pod для этих destinations?

## Options

- Использовать hostNetwork для всех pods
- Настроить ip-masq-agent
- Отключить kube-proxy
- Без service mesh это невозможно

## Solution

**Настроить ip-masq-agent** — правильный ответ: `ip-masq-agent` управляет masquerading по destination: CIDRs в nonMasqueradeCIDRs сохраняют исходный IP pod. У CNI есть аналоги, например Cilium ipMasqAgent и Calico natOutgoing для каждого IPPool.
