---
name: cowork-agents
description: >
  Multi-agent collaboration protocol where two or more AI agents communicate
  through a shared file (cowork.md), structured in Plan Mode (discuss & align)
  and Agent Mode (split & execute tasks), then jointly produce a cowork_insights.md
  synthesis. Trigger this skill whenever a user wants agents to collaborate,
  talk to each other, divide tasks between models, run a multi-model discussion,
  co-plan something together, or produce a shared insights document from agent
  conversations. Also trigger when user says "vibe code with agents", "agents
  talking to each other", "multi-agent file protocol", or "cowork agents".
---

# CoWork Agents Skill

A structured protocol for multi-agent collaboration through a shared communication file.

## Overview

Agents communicate via `cowork.md` — a live message log where each model writes
tagged messages. After the conversation completes, they jointly produce
`cowork_insights.md` — a clean synthesis of what was found, decided, and done.

---

## File Structure

### `cowork.md` — The Live Communication File

Every message follows this format:

```
[ModelName]: <message content>

---
```

Special message types use bracketed **stage tags** at the start:

| Tag | Meaning |
|-----|---------|
| `[INTRO]` | Model introduces itself — capabilities, role, personality |
| `[PLAN]` | Planning discussion turn |
| `[TASK]` | Assigning or claiming a task |
| `[UPDATE]` | Progress update mid-task |
| `[QUESTION]` | Asking another model something |
| `[ANSWER]` | Responding to a question |
| `[REVIEW]` | Reviewing another model's output |
| `[CORRECTION]` | Suggesting or applying an improvement |
| `[DONE]` | Announcing task completion |
| `[ENDCONVO]` | Proposing end of conversation with summary |
| `[INSIGHTS]` | Contributing a section to cowork_insights.md |

**Full example message:**
```
[Claude]: [INTRO] Hey! I'm Claude, made by Anthropic. I'm strong at reasoning,
writing, code review, and structuring complex problems. Looking forward to
collaborating — what are we building?

---

[GPT-4o]: [INTRO] Hi Claude! I'm GPT-4o. I'm fast at summarization, drafting,
and broad research synthesis. Happy to divide and conquer with you.

---
```

---

## Two Modes of Operation

### 🗺️ Plan Mode

Agents discuss, align, and decide BEFORE doing anything.

**Flow:**
1. **Introductions** — each agent posts `[INTRO]`
2. **Task framing** — user goal is stated clearly in cowork.md
3. **Discussion** — agents exchange `[PLAN]` messages, ask `[QUESTION]`, get `[ANSWER]`
4. **Alignment** — agents agree on: what to do, how to split it, success criteria
5. **Sign-off** — each agent confirms plan with a `[PLAN: AGREED]` message

Plan Mode ends when all agents post `[PLAN: AGREED]`.

**When to use:** Complex tasks, ambiguous requirements, tasks needing coordination,
anything where alignment upfront saves rework.

---

### ⚡ Agent Mode

Agents split tasks and execute in parallel, posting updates to cowork.md.

**Flow:**
1. From Plan Mode (or directly if task is clear), each agent claims tasks via `[TASK: CLAIMED]`
2. Agents work independently, posting `[UPDATE]` as they go
3. Agents post `[DONE]` when their task is complete with a brief summary
4. Any agent can ask `[QUESTION]` mid-execution; others respond with `[ANSWER]`
5. Agents review each other's outputs with `[REVIEW]` and suggest `[CORRECTION]`
6. After corrections are applied, the correcting agent posts `[CORRECTION: APPLIED]`

Agent Mode ends when all tasks are `[DONE]` and all `[REVIEW]` threads are resolved.

---

## Ending a Conversation

Any agent can propose ending the conversation:

```
[ModelName]: [ENDCONVO] I think we're done here. Here's my summary of what happened:
- Task X: completed, output is Y
- Task Z: completed, output is W
- Key decisions: ...
- Open questions for the user: ...

Ready to produce cowork_insights.md. Does everyone agree?

---
```

Other agents must confirm:

```
[ModelName]: [ENDCONVO: AGREED] ✓ Looks good to me. Let's write the insights.

---
```

Once all agents post `[ENDCONVO: AGREED]`, the conversation is closed and
`cowork_insights.md` is produced.

---

## Producing `cowork_insights.md`

Each agent contributes a section via `[INSIGHTS]` messages. The final document
is assembled from these contributions.

### Structure of `cowork_insights.md`

```markdown
# CoWork Insights
**Session:** <date/topic>
**Agents:** <list of agents>
**Mode:** Plan + Agent / Plan only / Agent only

---

## 🎯 Goal
<What the user asked for — in plain terms>

## 🗺️ Plan Summary
<How agents aligned on the approach — key decisions made>

## ⚡ What Was Done
### [AgentName]
- Task: <what they worked on>
- Output: <what was produced>
- Key findings: <anything notable>

### [AgentName]
...

## 💡 Insights & Findings
<Synthesized insights — things discovered, patterns noticed, interesting results>

## ✅ Deliverables
<List of files, outputs, or artifacts produced>

## ❓ Open Questions / Next Steps
<Anything unresolved or recommended for follow-up>

## 📝 Notes on the Collaboration
<Optional: how the agents worked together, any interesting coordination moments>
```

---

## How to Run This Skill

### Step 1: Initialize cowork.md

Create `cowork.md` with a header block:

```markdown
# CoWork Session
**Date:** <date>
**User Goal:** <paste the user's task here>
**Agents:** <list the models participating>
**Mode:** Plan → Agent

---
```

### Step 2: Run Introductions

Each agent writes its `[INTRO]` to cowork.md.

### Step 3: Plan Mode

Agents exchange `[PLAN]` messages until aligned. Read `references/plan-mode.md`
for detailed guidance on facilitation patterns.

### Step 4: Agent Mode

Each agent claims tasks, executes, updates. Read `references/agent-mode.md`
for task splitting patterns and review protocols.

### Step 5: End Conversation

Follow the `[ENDCONVO]` protocol above.

### Step 6: Produce Insights

Assemble `cowork_insights.md` from `[INSIGHTS]` contributions.

---

## Quick Reference: Message Format

```
[AgentName]: [STAGE_TAG] <message>

---
```

Valid stage tags: `INTRO`, `PLAN`, `PLAN: AGREED`, `TASK`, `TASK: CLAIMED`,
`UPDATE`, `QUESTION`, `ANSWER`, `REVIEW`, `CORRECTION`, `CORRECTION: APPLIED`,
`DONE`, `ENDCONVO`, `ENDCONVO: AGREED`, `INSIGHTS`

---

## Reference Files

- `references/plan-mode.md` — Detailed Plan Mode patterns and facilitation
- `references/agent-mode.md` — Task splitting, review, and correction protocols
- `references/cowork-example.md` — Full worked example of a complete session
- `references/insights-template.md` — Blank template for cowork_insights.md