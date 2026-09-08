## Question

Какова роль ресурса InferenceModel (или InferenceObjective) в Gateway API Inference Extension?

## Options

- Обучать модель внутри кластера
- Сопоставлять имя модели с InferencePool и задавать criticality
- Определять, сколько GPU каждый узел предоставляет scheduler
- Заменять Deployment model server

## Solution

**Сопоставлять имя модели с InferencePool и задавать criticality** — правильный ответ: `InferenceModel` связывает логическое имя модели, запрашиваемое клиентом, с обслуживающим её `InferencePool`, задаёт criticality для prioritization/shedding под нагрузкой и позволяет выполнять canary между версиями моделей/adapters.
