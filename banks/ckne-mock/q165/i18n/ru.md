## Question

Какая команда одним тестом проверяет pod-to-pod, pod-to-Service, DNS, policies и, если включено, шифрование в кластере Cilium?

## Options

- ping -c 1 8.8.8.8
- kubectl get all
- cilium delete --all
- cilium connectivity test

## Solution

**cilium connectivity test** — правильный ответ: `cilium connectivity test` — канонический smoke test после установки или обновления. Он проверяет сценарии, которые легко забыть вручную: hairpin, локальный и удалённый NodePort, L3–L7 policy, DNS и другие пути, указывая точный неуспешный тест.
