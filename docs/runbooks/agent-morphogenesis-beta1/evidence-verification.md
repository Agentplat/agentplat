# Agent Morphogenesis Beta 1 evidence-verification runbook

Verify the clean source commit and tree, readiness profile, signed execution
authorization, complete scenario manifest and installed public-key digest.
Recompute each receipt digest, metric binding, receipt root, metrics root,
bundle digest and detached Ed25519 attestation.

Require every registered scenario and soak iteration; reject missing, duplicate
or unexpected identities. Confirm zero external spend, zero duplicate effects,
no private key material, frozen baseline V1, and excluded future capabilities.
Report experimental evidence and production readiness separately; neither may
be inferred from a passing local readiness profile.
