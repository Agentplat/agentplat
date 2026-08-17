# Reference-integrated runtime profile

The governed collective runtime keeps its historical `flexible` profile by
default. In that profile, applications may provide only the phase handlers
they need. Applications that want the complete safety composition can opt in
to `profile: "reference-integrated"`.

The reference-integrated profile fails during construction unless handlers are
registered for every critical phase:

`observe`, `partition`, `strategy`, `approval`, `inference`, `effect`, and
`forensics`.

`topology` remains an optional extension point because some deployments use a
fixed topology. A missing critical handler produces a deterministic
`TypeError` with the missing phase names, before any mission state or effect is
created. This makes an incomplete safety composition impossible to start while
preserving backwards compatibility for existing flexible consumers.

Use the exported `validateGovernedCollectiveRuntimeProfileV1` helper when
assembling configuration dynamically, or pass the profile directly to
`createGovernedCollectiveRuntimeV1`:

```ts
createGovernedCollectiveRuntimeV1({
  missionId: "mission.example",
  policy,
  profile: "reference-integrated",
  phases: {
    observe,
    partition,
    strategy,
    approval,
    inference,
    effect,
    forensics,
  },
});
```
