## Question

Qual é a forma padronizada de permitir tráfego vindo de um namespace específico pelo NOME (ex.: "monitoring") em uma NetworkPolicy?

## Options

- ipBlock com o CIDR do namespace
- Escrever o nome literal no campo from.namespace
- namespaceSelector com a label kubernetes.io/metadata.name
- Não é possível selecionar por nome

## Solution

**namespaceSelector com a label kubernetes.io/metadata.name** é a resposta correta: Todo namespace recebe automaticamente a label imutável `kubernetes.io/metadata.name`. Usá-la no namespaceSelector permite referenciar namespaces pelo nome sem depender de labels manuais.
