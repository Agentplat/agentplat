#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:${API_PORT:-3000}}"
API_URL="${API_URL%/}"
TENANT_ID="${AGENTPLAT_TENANT_ID:-acme}"

for command in curl jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "The demo requires $command." >&2
    exit 1
  fi
done

request() {
  local method="$1"
  local path="$2"
  local body="${3-}"
  local args=(
    --silent
    --show-error
    --fail-with-body
    --request "$method"
    --header "X-Agentplat-Tenant-Id: $TENANT_ID"
  )

  if [[ -n "$body" ]]; then
    args+=(--header 'Content-Type: application/json' --data "$body")
  fi

  curl "${args[@]}" "$API_URL$path"
}

echo "Waiting for $API_URL/health ..." >&2
healthy=false
for ((attempt = 1; attempt <= 30; attempt += 1)); do
  if curl --silent --fail "$API_URL/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  echo "The Rooms API did not become healthy within 30 seconds." >&2
  exit 1
fi

echo 'Creating a Room ...' >&2
room_response=$(request POST /rooms "$(jq -nc '{
  title: "Customer launch room",
  goal: "Produce and approve a concise launch brief"
}')")
room_id=$(jq -er '.data.id' <<<"$room_response")

echo 'Exercising pause and resume transitions ...' >&2
request POST "/rooms/$room_id/pause" '{}' >/dev/null
request POST "/rooms/$room_id/resume" '{}' >/dev/null

echo 'Adding a human approver and a mock agent ...' >&2
human_response=$(request POST "/rooms/$room_id/participants" "$(jq -nc '{
  type: "human",
  displayName: "Morgan Approver",
  role: "owner",
  authorityLevel: 100,
  permissions: ["approve"],
  boundaries: [],
  memoryScope: "room"
}')")
human_id=$(jq -er '.data.id' <<<"$human_response")

agent_response=$(request POST "/rooms/$room_id/participants" "$(jq -nc '{
  type: "agent",
  displayName: "Launch Writer",
  role: "writer",
  authorityLevel: 10,
  permissions: ["draft"],
  boundaries: ["no_external_writes"],
  memoryScope: "room",
  runtime: {
    platform: "mock",
    instructions: "Draft clear, reviewable launch briefs."
  }
}')")
agent_id=$(jq -er '.data.id' <<<"$agent_response")

echo 'Writing the task brief into the transcript ...' >&2
request POST "/rooms/$room_id/messages" "$(jq -nc \
  --arg author "$human_id" '{
    authorParticipantId: $author,
    role: "human",
    content: "Draft a launch brief and submit it for human approval."
  }')" >/dev/null

echo 'Creating and running a structured handoff ...' >&2
task_response=$(request POST "/rooms/$room_id/tasks" "$(jq -nc \
  --arg participant "$agent_id" '{
    stepId: "draft-launch-brief",
    assignedParticipantId: $participant,
    assignedRole: "writer",
    instruction: "Draft a launch brief with audience, message, and next steps.",
    expectedOutput: "A concise launch brief",
    expectedArtifactKind: "launch_brief",
    dependencies: [],
    acceptanceCriteria: [
      "Names the target audience",
      "Contains a clear primary message",
      "Lists concrete next steps"
    ],
    actionLevel: "draft",
    approvalRequired: false,
    toolIds: []
  }')")
task_id=$(jq -er '.data.id' <<<"$task_response")

run_response=$(request POST "/rooms/$room_id/tasks/$task_id/run" '{}')
run_id=$(jq -er '.data.id' <<<"$run_response")

state_response=$(request GET "/rooms/$room_id")
artifact_id=$(jq -er --arg run_id "$run_id" '
  (
    .data.artifacts
    | map(select(.provenance.runId == $run_id))
    | last
    | .id
  ) // (.data.artifacts | last | .id)
' <<<"$state_response")

echo 'Requesting and granting human approval ...' >&2
approval_response=$(request POST "/rooms/$room_id/approvals" "$(jq -nc \
  --arg artifact "$artifact_id" \
  --arg requester "$agent_id" '{
    targetType: "artifact",
    targetId: $artifact,
    requestedBy: $requester
  }')")
approval_id=$(jq -er '.data.id' <<<"$approval_response")

request POST "/approvals/$approval_id/approve" "$(jq -nc \
  --arg approver "$human_id" '{
    decidedBy: $approver,
    comment: "Approved by the reference workflow."
  }')" >/dev/null

echo 'Completing and archiving the Room ...' >&2
request POST "/rooms/$room_id/complete" '{}' >/dev/null
request POST "/rooms/$room_id/archive" '{}' >/dev/null

echo 'Final Room projection:' >&2
request GET "/rooms/$room_id" | jq '.data'
