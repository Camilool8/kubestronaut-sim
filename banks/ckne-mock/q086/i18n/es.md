## Question

En Gateway API Inference Extension, ¿cuál es la función del recurso InferenceModel (o InferenceObjective)?

## Options

- Entrenar el modelo dentro del cluster
- Asignar el nombre del modelo a un InferencePool, con criticidad
- Definir cuántas GPU expone cada nodo al scheduler
- Sustituir el Deployment del servidor de modelos

## Solution

**Asignar el nombre del modelo a un InferencePool, con criticidad** es la respuesta correcta: `InferenceModel` asocia el nombre lógico del modelo (lo que solicita el cliente) con el `InferencePool` que lo sirve, define criticidad para priorización o shedding bajo carga y permite canary entre versiones/adaptadores del modelo.
