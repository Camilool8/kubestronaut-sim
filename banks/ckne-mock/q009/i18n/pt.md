## Question

Segundo a especificação CNI, o que o container runtime faz quando um pod é criado?

## Options

- Envia um CRD NetworkRequest para o apiserver
- Escreve diretamente nas tabelas de rotas do netns do pod
- Chama a API REST do plugin CNI via HTTPS
- Executa o binário do plugin com CNI_COMMAND=ADD, config via stdin

## Solution

**Executa o binário do plugin com CNI_COMMAND=ADD, config via stdin** é a resposta correta: CNI é um contrato de execução de binários: o runtime executa o plugin com env vars como `CNI_COMMAND=ADD`, `CNI_NETNS`, `CNI_IFNAME`, e a config JSON via stdin. O plugin devolve JSON com IPs/rotas. DEL é chamado na remoção.
