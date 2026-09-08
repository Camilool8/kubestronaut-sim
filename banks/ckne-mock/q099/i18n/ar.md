## Question

في Istio multi-cluster مع شبكات منفصلة لا تملك pod-to-pod connectivity مباشرة، ما المكون الذي يمرر حركة الخدمات بين clusters؟

## Options

- NodePort لكل Service في كل cluster
- east-west gateway مخصص يعرض الخدمات عبر clusters مع mTLS
- kubectl port-forward دائم
- VPN على أجهزة المطورين

## Solution

**east-west gateway مخصص يعرض الخدمات عبر clusters مع mTLS** هي الإجابة الصحيحة: عندما لا تتصل pods مباشرة بين clusters، يمرر Istio الحركة عبر east-west gateways مخصصة، مع الحفاظ على mTLS واكتشاف endpoints الموحد عبر الشبكات.
