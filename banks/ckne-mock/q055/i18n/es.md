## Question

Sin kubectl exec disponible, ¿cómo entra desde el nodo en el namespace de red de un pod para depurar?

## Options

- Reiniciar kubelet con --debug-netns
- Editar /etc/network/interfaces del nodo y recargarlo
- crictl inspect para obtener el PID y después nsenter -t `<PID>` -n
- Hacer ssh directamente a la IP del pod

## Solution

**crictl inspect para obtener el PID y después nsenter -t `<PID>` -n** es la respuesta correcta: `crictl ps` + `crictl inspect --output go-template --template '{{.info.pid}}'` proporcionan el PID; `nsenter -t PID -n ip addr` (o ss, tcpdump…) ejecuta comandos dentro del netns del pod utilizando las herramientas del host.
