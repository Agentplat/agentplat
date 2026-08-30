# Key custody and rotation

The staging signing key must be non-exportable and held by the external KMS or
HSM declared in the bound inventory. Resolve the canonical key ID, key spec,
sign/verify usage, public key fingerprint, account and IAM identity before the
campaign. Never copy private material into Kubernetes Secrets, environment
variables, logs, evidence bundles or the repository.

For rotation, create or enable the successor key, export only its public key
and register a bounded overlap window. Sign a rotation receipt with the current
key that binds both canonical IDs, fingerprints, activation time and expiry.
Verify new signatures, then revoke the predecessor for new authorization while
retaining its public key for historical verification. Exercise an unexpired old
authorization during overlap, an expired authorization afterward and a revoked
key request; the latter two must fail closed.

Recovery from a failed rotation keeps execution fenced, restores verification
of historical signatures from retained public keys and repeats the rotation
under a new operation ID; private key rollback is never permitted.

Abort if the canonical provider ID changes unexpectedly, the key is exportable,
IAM permits broad signing, rotation evidence is absent, or any revoked signature
authorizes execution. Preserve KMS audit events and public material as evidence.
Rotation proves custody behavior only for this staging campaign and does not
constitute security certification or production approval.
