# Agent Mode — Detailed Guide

Agent Mode is the execution phase. Agents split the work and do it, staying
in sync through cowork.md without blocking each other.

---

## Entering Agent Mode

Agent Mode begins immediately after all `[PLAN: AGREED]` messages are posted,
or at the start if Plan Mode is skipped.

First action: each agent claims their tasks.

```
[Claude]: [TASK: CLAIMED] Taking Task 2 (API endpoint structure) and Task 4
(UI components). Will start on Task 2 now and wait for GPT-4o's schema before
starting Task 4.

---

[GPT-4o]: [TASK: CLAIMED] Taking Task 1 (data schema) and Task 3 (ingestion
script). Starting Task 1 immediately.

---
```

---

## Task Execution

### Progress Updates

For longer tasks, post `[UPDATE]` messages to keep others informed:

```
[GPT-4o]: [UPDATE] Data schema draft is taking shape. I've defined 4 core
entities: User, Session, Event, Tag. Will post the full schema in ~5 minutes.

---
```

### Task Completion

When a task is done, post `[DONE]` with:
- What was produced
- Any decisions made along the way
- Anything the next agent needs to know

```
[GPT-4o]: [DONE] Task 1 complete — data schema posted below. Key decisions:
- Used UUID for all primary keys
- Timestamps are UTC ISO 8601
- Events table is append-only (no updates)

```json
{
  "users": { "id": "uuid", "email": "string", "created_at": "timestamp" },
  "events": { "id": "uuid", "user_id": "uuid", "type": "string", "ts": "timestamp" }
}
```

Claude — you can now start the API structure.

---
```

---

## Inter-Agent Communication During Execution

### Asking Questions Mid-Task

Any agent can block on a question:

```
[Claude]: [QUESTION] @GPT-4o — In the schema, should the API expose raw events
or pre-aggregated summaries? This changes the endpoint design significantly.

---

[GPT-4o]: [ANSWER] Pre-aggregated for the main UI. Raw events only for export/
admin endpoints.

---
```

**Rule:** If you're blocked, post `[QUESTION]` and wait. Don't guess on
something that will invalidate another agent's work.

**Rule:** If you receive a `[QUESTION]`, answer before continuing your own work.

---

## Review Protocol

After a task is `[DONE]`, the other agent(s) should review it.

### Posting a Review

```
[Claude]: [REVIEW] Reviewed GPT-4o's data schema. Overall solid. One concern:
the Events table has no index on `user_id` — this will cause full table scans
for per-user queries. Suggesting we add that.

Minor: `type` field might be better as an enum to prevent bad values.

---
```

### Responding to a Review

If the review identifies a real issue:

```
[GPT-4o]: [CORRECTION] Good catches. Updated schema:
- Added INDEX on events(user_id)
- Changed `type` to enum: ['click', 'view', 'submit', 'error']

```json
// updated schema here
```

[CORRECTION: APPLIED] Review thread resolved.

---
```

If you disagree with the review:

```
[GPT-4o]: [ANSWER] On the enum point — I'd rather keep `type` as a string for
flexibility (we don't know all event types yet). Can revisit in a follow-up.
[CORRECTION: APPLIED] (index only)

---
```

### When Reviews Are Complete

A task's review thread is closed when the correcting agent posts
`[CORRECTION: APPLIED]`. All review threads must be closed before `[ENDCONVO]`.

---

## Task Dependency Management

When a task depends on another:

```
[Claude]: [UPDATE] Waiting on Task 1 schema before I can start Task 2 API
structure. Continuing with Task 4 UI scaffolding in the meantime.

---
```

Never assume another agent's output — wait for `[DONE]` and read what they posted.

---

## Parallel vs Sequential Work

**Parallel:** Tasks with no dependencies can run simultaneously. Both agents
just start and post updates.

**Sequential:** If Task B depends on Task A, the Task B agent either:
- Waits and works on something else
- Posts `[UPDATE] Blocked on Task A — on standby`

---

## Handling Unexpected Problems

If something goes wrong mid-task:

```
[Claude]: [UPDATE] Hit an unexpected issue with Task 4 — the UI framework
doesn't support the data format from Task 1 without a transform layer.
Two options:
(A) Add a transform in Task 4 (my work, no impact on GPT-4o)
(B) Change Task 1 schema output format (impacts GPT-4o's task)

Which do we prefer?

---
```

Don't silently fix things that affect other agents' work. Surface it.

---

## Agent Mode Checklist

Before posting `[ENDCONVO]`, verify:
- ✅ All `[TASK: CLAIMED]` tasks have `[DONE]` messages
- ✅ All `[REVIEW]` threads have `[CORRECTION: APPLIED]` closings
- ✅ All `[QUESTION]` threads have `[ANSWER]` responses
- ✅ No agent is still blocked/waiting