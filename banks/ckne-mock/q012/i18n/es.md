## Question

¿Cuál es la principal ventaja del modo IPVS de kube-proxy frente al modo iptables?

## Options

- Soporte nativo de balanceo L7 (HTTP) con inspección de headers
- Complejidad O(1) en el reenvío y algoritmos de balanceo
- No necesita el módulo conntrack
- Cifra el tráfico entre pods

## Solution

**Complejidad O(1) en el reenvío y algoritmos de balanceo** es la respuesta correcta: En modo iptables, las reglas crecen con el número de Services y se evalúan secuencialmente. IPVS utiliza tablas hash en el kernel (búsqueda ~O(1)) y ofrece round-robin, least-connections y source-hash. Ambos siguen siendo L4.
