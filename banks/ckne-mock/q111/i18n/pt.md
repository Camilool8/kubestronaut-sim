## Question

Por que os certificados de workload de um service mesh (SVIDs) têm vida curta (ex.: 24h) e são rotacionados automaticamente?

## Options

- Para economizar espaço em disco nos nós
- Para forçar reinício diário dos pods
- Janela curta para certificados comprometidos, sem depender de revogação
- Porque o TLS exige expiração em 24h por norma do IETF

## Solution

**Janela curta para certificados comprometidos, sem depender de revogação** é a resposta correta: Vida curta = exposição curta: um certificado vazado vale horas, não anos, e a revogação (historicamente falha) torna-se desnecessária. istio-agent/SPIRE renovam os SVIDs automaticamente antes da expiração, sem reiniciar os workloads.
