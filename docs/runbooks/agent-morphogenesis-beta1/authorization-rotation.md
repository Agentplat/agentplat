# Agent Morphogenesis Beta 1 authorization rotation runbook

Generate Ed25519 keys outside the checkout. Publish only SPKI public-key PEM
and the signed authorization. Install the new public-key SHA-256 atomically,
then verify the new authorization before admitting another scenario.

After the head changes, an authorization signed by the prior key must fail even
inside its original time interval. At `expiresAt` the current authorization is
inactive. Keep the old public key only for historical signature verification;
delete ephemeral private keys after signing. Rotation never expands the zero
spend ceiling or the registered scenario set.
