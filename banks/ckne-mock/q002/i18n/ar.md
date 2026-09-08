## Question

أي مكوّن في Kubernetes يخصّص podCIDR لكل عقدة عند تفعيل --allocate-node-cidrs=true؟

## Options

- kubelet
- kube-controller-manager
- kube-scheduler عند ربط pod بالعقدة
- kube-proxy في وضع IPVS

## Solution

**kube-controller-manager** هي الإجابة الصحيحة: يقسّم `kube-controller-manager` عبر NodeIPAM المجال `--cluster-cidr` إلى شبكات فرعية ويعيّن `spec.podCIDR` لكل عقدة. بعض حلول CNI تستخدم IPAM خاصاً بها وتتجاهل هذا الحقل.
