## Question

Na Gateway API Inference Extension, qual é o papel do recurso InferenceModel (ou InferenceObjective)?

## Options

- Treinar o modelo dentro do cluster
- Mapear o nome do modelo para um InferencePool, com criticality
- Definir quantas GPUs cada nó expõe ao scheduler
- Substituir o Deployment do servidor de modelo

## Solution

**Mapear o nome do modelo para um InferencePool, com criticality** é a resposta correta: O `InferenceModel` associa o nome lógico do modelo (o que o cliente pede) ao `InferencePool` que o serve, define criticidade (para priorização/descarte sob carga) e permite canary entre versões/adaptadores do modelo.
