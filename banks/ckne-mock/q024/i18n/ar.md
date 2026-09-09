## Question

أي مشروع رسمي يوسّع Gateway API لتحسين توجيه حركة inference الخاصة بـ LLM على Kubernetes؟

## Options

- Gateway API Inference Extension
- CNCF LLMProxy Operator
- MetalLB AI mode
- Kubeflow Pipelines Serving

## Solution

**Gateway API Inference Extension** هي الإجابة الصحيحة: يضيف `Gateway API Inference Extension` موارد مثل `InferencePool` وEndpoint Picker يختار بناءً على metrics خادم النموذج، مثل عمق الطابور واستخدام KV-cache وLoRA، بدلاً من round-robin الأعمى.
