## Question

Un pod con hostNetwork: true alcanza pods protegidos por una NetworkPolicy que solo permite determinados podSelectors, y el acceso FUNCIONA. ¿Por qué?

## Options

- hostNetwork habilita un modo de red administrativo
- NetworkPolicy tiene un bug conocido con TCP keepalive
- La policy solo cubre TCP y el acceso utiliza UDP
- Su tráfico se origina en la IP del NODO, no en una IP de pod con identidad

## Solution

**Su tráfico se origina en la IP del NODO, no en una IP de pod con identidad** es la respuesta correcta: Para la red, los pods hostNetwork "son el nodo". Muchos CNI tratan especialmente las IP de los nodos, ya que las probes de kubelet deben pasar. Como resultado, las policies basadas en identidad de pod no los restringen como se espera; tenga cuidado con lo que se ejecuta en hostNetwork.
