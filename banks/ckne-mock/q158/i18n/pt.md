## Question

Na regra from, qual é a diferença entre namespaceSelector: {} e omitir o namespaceSelector?

## Options

- namespaceSelector: {} (vazio) casa TODOS os namespaces do cluster
- O seletor vazio não casa nenhum namespace (conjunto vazio)
- O seletor vazio é sintaxe inválida e rejeitada na admissão
- Nenhuma diferença

## Solution

**namespaceSelector: {} (vazio) casa TODOS os namespaces do cluster** é a resposta correta: Em selectors do Kubernetes, vazio = seleciona tudo. `namespaceSelector: {}` abre para o cluster inteiro — o oposto da intuição "vazio = nada". Uma das pegadinhas mais cobradas.
