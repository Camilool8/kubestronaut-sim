## Question

Sem o binário do kubectl exec disponível, como entrar no namespace de rede de um pod a partir do nó para depurar?

## Options

- Reiniciar o kubelet com --debug-netns
- Editar o /etc/network/interfaces do nó e recarregar
- crictl inspect para obter o PID e nsenter -t `<PID>` -n
- ssh direto para o IP do pod

## Solution

**crictl inspect para obter o PID e nsenter -t `<PID>` -n** é a resposta correta: `crictl ps` + `crictl inspect --output go-template --template '{{.info.pid}}'` dão o PID; `nsenter -t PID -n ip addr` (ou ss, tcpdump…) executa comandos dentro do netns do pod usando as ferramentas instaladas no host.
