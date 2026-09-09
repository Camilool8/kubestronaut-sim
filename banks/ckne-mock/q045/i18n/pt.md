## Question

Uma NetworkPolicy de default-deny egress foi aplicada e os pods pararam de resolver DNS. Qual regra mínima restaura a resolução de nomes?

## Options

- Permitir ingress na porta 443
- Recriar o Service kube-dns
- Permitir egress para os pods do kube-dns
- Adicionar o CoreDNS ao hostNetwork

## Solution

**Permitir egress para os pods do kube-dns** é a resposta correta: Com deny-all de egress, até as consultas ao CoreDNS são bloqueadas — sintoma clássico: `could not resolve host` para tudo. Libere UDP e TCP 53 (TCP é usado em respostas grandes/truncadas).
