# Solution 1

    k create ns aurora-staging
    k label ns aurora-staging team=aurora
    k -n aurora-staging create quota staging-quota --hard=pods=5,requests.cpu=1
    mkdir -p /opt/course/1
    k get ns -l team=aurora -o name | cut -d/ -f2 | sort > /opt/course/1/aurora-namespaces

Verify: `cat /opt/course/1/aurora-namespaces` → aurora-data, aurora-staging,
aurora-web (one per line).
