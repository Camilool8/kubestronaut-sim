TCP connections between nodes over VXLAN fail bizarrely (handshake OK, data corrupted/stuck). A known workaround is `ethtool -K flannel.1 tx-checksum-ip-generic off`. What is the underlying problem?
