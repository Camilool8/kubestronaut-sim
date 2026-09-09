## Question

Как в Calico создать явный deny с приоритетом над allow rules?

## Options

- Явный deny невозможен ни в одном CNI
- Calico policies с action: Deny и полем order
- Annotation deny=true у нативной policy
- Удалить CNI

## Solution

**Calico policies с action: Deny и полем order** — правильный ответ: Policies Calico имеют `order` и actions Allow/Deny/Log/Pass, подобно классическому firewall. Deny с меньшим order срабатывает раньше поздних allows. В нативном API этого нет, поэтому регулируемые среды используют CRDs CNI или AdminNetworkPolicy.
