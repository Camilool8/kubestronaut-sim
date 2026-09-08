## Question

O que é roteamento LoRA-aware em gateways de inferência?

## Options

- Usar apenas GPUs NVIDIA
- Enviar para réplicas que já têm o adaptador LoRA carregado
- Comprimir as respostas
- Balancear pelo hash do prompt entre todas as réplicas

## Solution

**Enviar para réplicas que já têm o adaptador LoRA carregado** é a resposta correta: Servidores como vLLM expõem quais adaptadores LoRA estão carregados. O Endpoint Picker prioriza réplicas com o adaptador quente — trocar adaptadores custa tempo de GPU e degrada a latência de todos na fila.
