## Question

Uma NetworkPolicy tem policyTypes: [Ingress], mas o autor também escreveu um bloco egress: [...] no spec. Qual é o efeito do bloco egress?

## Options

- É aplicado normalmente
- Bloqueia todo o egress
- Gera erro de validação
- É IGNORADO: policyTypes manda

## Solution

**É IGNORADO: policyTypes manda** é a resposta correta: O enforcement segue `policyTypes`, não a presença das seções. Regras de egress "decorativas" passam despercebidas em review — pegadinha frequente em auditorias e provas.
