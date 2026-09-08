## Question

يظهر kubectl exec أن eth0 داخل pod بحالة UP وبـ IP صحيح، لكن لا تدخل أو تخرج أي حركة. على العقدة يظهر peer الخاص بـ veth في LOWERLAYERDOWN. ماذا يعني ذلك؟

## Options

- LOWERLAYERDOWN حالة طبيعية
- يحتاج pod إلى CPU أكثر
- DNS مضبوط خطأ
- المشكلة في الطرف الآخر لزوج veth على المضيف

## Solution

**المشكلة في الطرف الآخر لزوج veth على المضيف** هي الإجابة الصحيحة: زوج veth مثل كابل بطرفين. إذا سقط طرف المضيف أو خرج من bridge يفقد طرف pod الطبقة السفلى. تشير `LOWERLAYERDOWN` إلى مشكلة على المضيف لا داخل pod.
