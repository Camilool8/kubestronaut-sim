## Question

لإعطاء pod واجهة شبكة ثانية، مثل NIC مخصصة لحركة التخزين، ما الحل والمورد المستخدمان؟

## Options

- إنشاء خدمتين تشيران إلى pod نفسه
- Multus CNI مع NetworkAttachmentDefinition وannotation ‏k8s.v1.cni.cncf.io/networks على pod
- تفعيل hostNetwork: true
- kubectl expose مع --interfaces=2

## Solution

**Multus CNI مع NetworkAttachmentDefinition وannotation ‏k8s.v1.cni.cncf.io/networks على pod** هي الإجابة الصحيحة: يعمل `Multus` كـ meta-plugin لـ CNI: يحافظ على الشبكة الافتراضية ويضيف واجهات مثل net1 وnet2 معرفة عبر CRD باسم `NetworkAttachmentDefinition` ويتم اختيارها من annotation على pod.
