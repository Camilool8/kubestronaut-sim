## Question

Em uma topologia Istio multi-cluster com redes distintas (sem conectividade direta pod-a-pod), qual componente permite o tráfego de serviço atravessar entre os clusters?

## Options

- Um NodePort por serviço aberto em todos os clusters
- East-west gateway dedicado expõe serviços entre clusters (mTLS)
- kubectl port-forward permanente
- VPN nos laptops dos desenvolvedores

## Solution

**East-west gateway dedicado expõe serviços entre clusters (mTLS)** é a resposta correta: Quando os pods de clusters diferentes não se alcançam diretamente, o Istio roteia o tráfego cross-cluster através de east-west gateways (LoadBalancer dedicado), mantendo mTLS e descoberta unificada de endpoints entre as redes.
