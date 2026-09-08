## Question

¿En qué directorio busca el kubelet, de forma predeterminada, los archivos de configuración de red CNI?

## Options

- /etc/kubernetes/cni/
- /opt/cni/bin/
- /etc/cni/net.d/
- /var/lib/cni/conf/

## Solution

**/etc/cni/net.d/** es la respuesta correcta: Los archivos de configuración (*.conf / *.conflist) se encuentran en `/etc/cni/net.d/`. Los binarios de los plugins se encuentran en `/opt/cni/bin/`. Si el directorio de configuración está vacío, los nodos permanecen NotReady con el error "cni plugin not initialized".
