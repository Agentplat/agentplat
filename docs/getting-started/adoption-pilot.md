# Developer adoption pilot

Status: **pending participants; no observed usability improvement claimed**.

## Protocol

Recruit 3–5 external TypeScript developers with no prior AgentPlat experience.
Obtain authorization before contacting anyone. Use synthetic proposal data and
anonymous participant IDs. Participation is voluntary; collect only task timing,
errors, documentation questions and facilitator interventions, not credentials
or model content. Agree with participants on storage and deletion of notes.

Use the persistent collaboration guide on a clean checkout at a recorded commit.
Record OS, Node/pnpm/PostgreSQL versions, Docker availability and whether
prerequisites were installed beforehand. Record prerequisite setup separately
from the timed task; do not hide failed setup attempts.

Start the 45-minute clock when the participant begins the documented install
commands with prerequisites available. Ask them to:

1. Start the API and complete the two-agent proposal demo.
2. Locate the human revision decision and approved proposal version.
3. Run recovery and identify retained work and the operation identity.
4. Explain what is persistent, what is mock, and which protections and identity
   checks the application must configure.

Allow documentation lookup. Log help verbatim; corrective facilitator help
makes the primary unaided-completion endpoint false. Stop at 45 minutes and
record incomplete work. Do not omit failures or replace participants to improve
results. Do not use real model calls in the timed path.

## Acceptance and analysis

The exploratory target is at least 80% unaided completion of all four tasks
within 45 minutes: 3/3, 4/4 or 4/5, depending on final cohort size. Freeze cohort
size before sessions. Report counts and individual durations, not a population
productivity claim. There is no measured baseline comparison in this protocol.

Record blockers, change the guide or example, rerun automated checks and repeat
blocked tasks. Keep initial and follow-up outcomes separate. Technical checks
may pass while this pilot remains pending.

## Observation template

Copy this table for each anonymous participant; leave observations empty until
an actual session. Do not populate it with synthetic success data.

| Field                                              | Observation |
| -------------------------------------------------- | ----------- |
| Participant ID / date / source commit              |             |
| Environment / prerequisite setup time and failures |             |
| API start elapsed time                             |             |
| Proposal and review inspection elapsed time        |             |
| Recovery elapsed time                              |             |
| Explanation of persistence and controls            |             |
| Errors / documentation questions                   |             |
| Facilitator help / timestamp                       |             |
| Completed all tasks unaided within 45 minutes?     |             |
| Blockers / follow-up changes / retest outcome      |             |

Aggregate report: planned cohort, attempted sessions, unaided completions,
assisted completions, incomplete sessions, durations, recurring blockers and
follow-up results. Owner schedules sessions when participants are available.
