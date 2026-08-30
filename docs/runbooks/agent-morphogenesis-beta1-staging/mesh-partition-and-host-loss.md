# Agent Mesh partition and host loss

Resolve each Mesh process endpoint, peer identity, node UID and failure domain
from the bound inventory. Verify authenticated channels, current membership
epoch, quorum threshold, PostgreSQL durability and empty unexpected pending
queues before injecting a fault.

Partition one minority domain from the other two. Minority peers must not issue
collective Morphogenesis authorization, while durable inbox/outbox retries stay
bounded. Heal the network and verify causal convergence and deduplication. Then
remove an entire node and allow the scheduler or operator to replace its
processes in another permitted domain. Run at least six partition cycles and
three host-loss cycles, including a cycle during version skew.

Abort on split-brain authorization, stale-fence mutation, dependent evidence
counted as independent, duplicate material effect, lost receipt or divergent
final state. Fence new collective decisions until membership and causal state
reconcile. Record network rules, provider/node events, membership epochs,
process restarts, pending counts, receipt roots and recovery latency. Local
container restarts never count as host-loss evidence for distributed staging,
and these tests do not establish production readiness.
