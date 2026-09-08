## Question

Um HTTPRoute precisa usar backendRefs para um Service em OUTRO namespace. O que é obrigatório?

## Options

- Recriar o Service como NodePort
- Um ReferenceGrant no namespace do Service autorizando o route
- Nada, referências entre namespaces são permitidas por padrão
- Colocar o Gateway em kube-system

## Solution

**Um ReferenceGrant no namespace do Service autorizando o route** é a resposta correta: Referências cross-namespace são negadas por padrão (segurança contra "roubo" de tráfego). O dono do namespace de destino publica um `ReferenceGrant` declarando from (kind/namespace) e to (kind/name) — só então o route resolve.
