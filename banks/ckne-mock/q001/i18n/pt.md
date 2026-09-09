## Question

Em qual diretório o kubelet procura, por padrão, os arquivos de configuração de rede CNI?

## Options

- /etc/kubernetes/cni/
- /opt/cni/bin/
- /etc/cni/net.d/
- /var/lib/cni/conf/

## Solution

**/etc/cni/net.d/** é a resposta correta: Os arquivos de configuração (*.conf / *.conflist) ficam em `/etc/cni/net.d/`. Já os binários dos plugins ficam em `/opt/cni/bin/`. Se o diretório de config estiver vazio, os nós ficam NotReady com erro "cni plugin not initialized".
