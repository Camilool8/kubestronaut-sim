## Question

Qual mecanismo fornece autenticação mútua por workload (identidade criptográfica por pod) com mTLS automático, tipicamente via service mesh?

## Options

- Basic Auth no kubelet
- Senha compartilhada distribuída em um ConfigMap
- O admission plugin NodeRestriction do apiserver
- mTLS com identidades SPIFFE/SVID emitidas automaticamente

## Solution

**mTLS com identidades SPIFFE/SVID emitidas automaticamente** é a resposta correta: Meshes atribuem a cada workload uma identidade SPIFFE (ex.: `spiffe://cluster/ns/sa/…`) em certificados X.509 de curta duração (SVIDs), estabelecendo mTLS automático baseado em ServiceAccount, não em IP.
