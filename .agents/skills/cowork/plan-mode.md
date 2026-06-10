# Plan Mode — Detailed Guide

Plan Mode is the discussion phase before any real work happens. Think of it as
agents sitting around a table, figuring out what they're really being asked to do
and how they're going to do it together.

---

## When Plan Mode is Required

Always use Plan Mode when:
- The user's goal is broad or ambiguous
- Multiple possible approaches exist
- Task dependencies need mapping
- Agents have different strengths that need coordination
- There's risk of duplicating work

Skip Plan Mode only when:
- The task is extremely simple (one agent, one step)
- The user explicitly says "just do it"

---

## Plan Mode Flow

### Phase 1: Introductions

Each agent posts an `[INTRO]` establishing:
- Name and origin (e.g., "Claude by Anthropic")
- Strengths and specialties
- Anything relevant to the current task
- A warm/collaborative tone

```
[Claude]: [INTRO] Hello! I'm Claude, built by Anthropic. For this session I'll
be handling structural reasoning, code review, and writing. I tend to think
step-by-step and like to surface edge cases early. What are we tackling?

---
```

### Phase 2: Task Framing

One agent (usually the first to respond or the "facilitator") restates the
user's goal to make sure everyone is aligned:

```
[Claude]: [PLAN] Let me restate what I understand we're building:
- Goal: <restate>
- Key constraints: <list any constraints from user>
- What success looks like: <define the done state>

Does this match what others understand?

---
```

### Phase 3: Discussion

Agents discuss freely. Any agent can:
- Propose an approach
- Push back on another's proposal
- Ask a clarifying question
- Flag a risk or edge case

```
[GPT-4o]: [PLAN] I'd suggest splitting this into two parallel streams:
(A) data ingestion and (B) UI rendering. I can handle A while Claude handles B.

---

[Claude]: [QUESTION] For stream A — are we expecting real-time data or batch?
That changes the architecture significantly.

---

[GPT-4o]: [ANSWER] Batch for now, but we should design with real-time in mind.

---
```

### Phase 4: Task Mapping

Before sign-off, agents agree on:
- What tasks exist
- Who owns each task
- What order tasks run (dependencies)
- What the handoff looks like between tasks

```
[Claude]: [PLAN] Here's my proposed task map:
1. [GPT-4o] → data schema design
2. [Claude] → API endpoint structure (depends on 1)
3. [GPT-4o] → data ingestion script (depends on 1)
4. [Claude] → UI components (depends on 2)
5. Both → review each other's outputs
6. Both → produce insights

---
```

### Phase 5: Alignment Sign-Off

Each agent posts explicit agreement:

```
[GPT-4o]: [PLAN: AGREED] Task map looks good. I'll start on schema design
once we enter Agent Mode.

---

[Claude]: [PLAN: AGREED] Same here. Starting on API structure after GPT-4o
posts the schema.

---
```

Once all agents have posted `[PLAN: AGREED]`, Plan Mode ends.

---

## Facilitation Patterns

### If agents disagree:
- Each states their position once, cleanly
- Identify the actual point of disagreement (often a hidden assumption)
- Try to find a third option that addresses both concerns
- If stuck, defer to the user

```
[Claude]: [PLAN] We seem to disagree on whether to use REST or GraphQL.
The real question is: does the UI need flexible querying? If no → REST is
simpler. If yes → GraphQL is worth the overhead. Can we check with the user?

---
```

### If a question can't be answered:
- Log it as an open question
- Make a reasonable assumption and state it explicitly
- Proceed with that assumption; flag it in insights

```
[GPT-4o]: [PLAN] We don't know the expected data volume. I'll assume <1000
records for now — flagging this as a risk in insights if it matters.

---
```

### If one agent is clearly more suited:
- That agent can volunteer naturally
- Other agents should defer on their areas

---

## Plan Mode Output

Before leaving Plan Mode, cowork.md should contain:
- ✅ All agents introduced
- ✅ Goal restated and agreed
- ✅ Task list with owners
- ✅ Dependencies noted
- ✅ All `[PLAN: AGREED]` posted