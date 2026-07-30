# Protocol v0 structural fixtures

These fixtures exercise strict parsing, closed schemas, message-specific
constraints and canonical binary representations for the Alpha 1 subset and
the Alpha 2 discovery/capability, Objective, Work Offer, Work Bid, Work Award,
Work Accept, Work Decline, Work Progress, Work Checkpoint and Work Result
records, plus Work Release, Work Cancel and Lease Renewal records.
Lease Takeover Proposal, Lease Vote and Lease Certificate are also covered as
structural recovery records.

The digest and proof fields are deterministic representation placeholders.
They are not cryptographic test vectors and do not assert that a payload digest
or signature verifies. No private key material is included.
