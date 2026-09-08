## Question

ما فائدة publishNotReadyAddresses: true في Service؟

## Options

- إدراج pods غير الجاهزة أيضاً في DNS وendpoints
- تجاهل livenessProbe
- نشر Service على الإنترنت عبر LoadBalancer
- تكرار endpoints

## Solution

**إدراج pods غير الجاهزة أيضاً في DNS وendpoints** هي الإجابة الصحيحة: عادة لا تدخل إلا pods الجاهزة في DNS وendpoints. لكن clusters مثل etcd أو Cassandra قد تحتاج أن يرى الأعضاء بعضهم قبل أن يصبحوا ready. يحل هذا الحقل مشكلة chicken-and-egg، خصوصاً مع headless Services وStatefulSets.
