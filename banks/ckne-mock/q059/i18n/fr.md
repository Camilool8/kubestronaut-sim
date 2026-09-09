## Question

Quelle commande tcpdump capture uniquement le trafic DNS d'un pod d'IP 10.0.1.5, sur n'importe quelle interface du nœud ?

## Options

- tcpdump -i lo udp port 53 -c 100
- tcpdump -i any -n port 53 and host 10.0.1.5
- tcpdump -n tcp port 80 and host 10.0.1.5
- tcpdump -i eth0 icmp and host 10.0.1.5

## Solution

**tcpdump -i any -n port 53 and host 10.0.1.5** est la bonne réponse : `-i any` couvre toutes les interfaces (utile quand on ignore le veth), `port 53` filtre le DNS (UDP et TCP), `host 10.0.1.5` restreint au pod. Ajoutez `-vvv` pour voir noms et rcodes.
