# CoWork Example — Full Session

**Task given by user:** "Research the top 3 vector database options and write
a comparison doc with a recommendation."

---

## `cowork.md` — Full Session Log

```
# CoWork Session
**Date:** 2025-11-10
**User Goal:** Research the top 3 vector database options and produce a comparison
doc with a recommendation.
**Agents:** Claude, GPT-4o
**Mode:** Plan → Agent

---

[Claude]: [INTRO] Hey! I'm Claude by Anthropic. I'm good at structured writing,
analysis, and synthesizing tradeoffs. For this task I'll focus on structuring
the comparison framework and writing the final doc. Excited to work together!

---

[GPT-4o]: [INTRO] Hi Claude! GPT-4o here. I'm great at broad research synthesis
and rapid summarization. I'll handle the initial research sweep across the
candidates. Let's build something good.

---

[Claude]: [PLAN] Let me frame what I think we're doing:
- Goal: Compare the top 3 vector databases
- Output: A comparison document with a clear recommendation
- Success: The user can read it and make an informed decision

Proposed approach:
1. GPT-4o researches candidates and collects raw data per database
2. Claude defines the comparison framework (criteria)
3. Both fill in the matrix
4. Claude writes the final doc
5. GPT-4o reviews it

Does this work?

---

[GPT-4o]: [PLAN] Works for me. One question — should we pick the top 3
ourselves, or check with the user?

---

[Claude]: [QUESTION] @User — should we pick the top 3 (likely Pinecone, Weaviate,
Qdrant) or do you have specific ones in mind?

---

[Claude]: [PLAN] I'll assume Pinecone, Weaviate, Qdrant as the top 3 for now —
these are the most commonly cited. Flagging this assumption.

---

[GPT-4o]: [PLAN: AGREED] Good assumption. Task split looks right. I'll start
research in Agent Mode.

---

[Claude]: [PLAN: AGREED] Let's go. I'll start on the comparison framework in
parallel.

---

[GPT-4o]: [TASK: CLAIMED] Taking Task 1 — research sweep on Pinecone, Weaviate,
and Qdrant. Will cover: pricing, performance benchmarks, hosted vs self-hosted,
ease of use, query language / SDK.

---

[Claude]: [TASK: CLAIMED] Taking Task 2 — comparison framework + final document
structure. Will also write the doc once GPT-4o's data is in.

---

[GPT-4o]: [UPDATE] Halfway through Pinecone. Key thing I'm finding: pricing is
pod-based, not query-based — this is a significant differentiator. Will surface
this in the matrix.

---

[Claude]: [DONE] Task 2 — Comparison framework defined:

Criteria:
1. Deployment model (hosted / self-hosted / both)
2. Pricing model (free tier, scaling cost)
3. Performance at scale (millions of vectors)
4. SDK / query language
5. Ecosystem integrations (LangChain, LlamaIndex, etc.)
6. Ease of setup
7. Production readiness / stability

GPT-4o — this is the structure I'll use to write the doc once your data is in.

---

[GPT-4o]: [DONE] Task 1 — Research complete. Summary:

**Pinecone**
- Hosted only
- Pod-based pricing, can get expensive at scale
- Very fast, battle-tested
- Great SDK, deep LangChain integration
- Easiest setup of the three

**Weaviate**
- Both hosted (WCS) and self-hosted
- Generous free tier on WCS
- Good performance, GraphQL query interface
- Strong ecosystem, supports multimodal
- Medium setup complexity

**Qdrant**
- Self-hosted primarily (cloud beta)
- Open-source, free to self-host
- Excellent performance benchmarks
- Rust core — very fast
- Most complex setup, but most control

Recommended for your framework, Claude.

---

[Claude]: [UPDATE] Writing comparison doc now. Will have a draft in ~3 minutes.

---

[Claude]: [DONE] Task 3 — Comparison doc written. Full content:

---

# Vector Database Comparison: Pinecone vs Weaviate vs Qdrant

## Summary Recommendation
**For most teams:** Start with Pinecone if budget allows; Weaviate if you need
multimodal or want a free hosted tier; Qdrant if you need maximum control
and performance on a budget.

## Comparison Matrix

| Criteria | Pinecone | Weaviate | Qdrant |
|---|---|---|---|
| Deployment | Hosted only | Both | Self-hosted (cloud beta) |
| Free tier | Limited | Yes (WCS) | Yes (self-host) |
| Pricing model | Pod-based | Usage-based | Free / infrastructure cost |
| Performance | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Ease of setup | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Ecosystem | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Multimodal | No | Yes | No |

## Detailed Analysis
[... full analysis ...]

## Our Recommendation
For most production teams choosing today: **Pinecone** for simplicity,
**Qdrant** if performance and cost at scale are priorities.

---

[GPT-4o]: [REVIEW] Doc looks great. Two small notes:
1. The performance stars for Qdrant might need a caveat — it's bench-tested
   but real-world varies by hardware.
2. The recommendation section could mention Weaviate's multimodal use case
   more explicitly as a differentiator.

---

[Claude]: [CORRECTION] Both good points. Updated:
- Added "(benchmark conditions)" note to Qdrant performance rating
- Added "Choose Weaviate if you're working with image/text mixed search" to
  recommendation section

[CORRECTION: APPLIED] ✓

---

[GPT-4o]: [ENDCONVO] I think we're done. Summary:
- Task 1 (research): ✅ Done
- Task 2 (framework): ✅ Done
- Task 3 (doc): ✅ Done, reviewed, corrections applied
- Open question: User's specific budget / deployment preference (noted in doc)

Ready to produce cowork_insights.md. Agreed?

---

[Claude]: [ENDCONVO: AGREED] ✓ Fully agree. Let's write the insights.

---

[Claude]: [INSIGHTS]
## What Was Done
### Claude
- Defined the comparison framework (6 criteria)
- Wrote the full comparison doc including matrix and recommendation
- Applied corrections from GPT-4o's review

### GPT-4o
- Conducted research sweep on all 3 databases
- Reviewed final document and caught two important improvements

## Key Findings
- Pinecone's pod-based pricing is a hidden scaling cost many teams don't
  anticipate — worth highlighting to users
- Qdrant's performance benchmark lead comes with self-hosting complexity tradeoff
- Weaviate is the clear winner for multimodal use cases — uniquely positioned

## Decisions Made
- Assumed Pinecone / Weaviate / Qdrant as the top 3 (unconfirmed by user)
- Simplified performance to a star rating with a caveat added post-review

---

[GPT-4o]: [INSIGHTS]
## My Perspective on the Collaboration
The split worked well — parallel tracks (research + framework) converged cleanly.
The review step caught two real improvements. The [QUESTION] about which databases
to use was a good catch — should've confirmed with user before assuming.
```

---

## `cowork_insights.md` — Final Output

```markdown
# CoWork Insights
**Session:** 2025-11-10 — Vector Database Comparison
**Agents:** Claude (Anthropic), GPT-4o (OpenAI)
**Mode:** Plan → Agent

---

## 🎯 Goal
Research the top 3 vector database options and produce a comparison document
with a clear recommendation the user can act on.

## 🗺️ Plan Summary
Agents agreed to split work into parallel tracks: GPT-4o handling research,
Claude handling framework and writing. One key assumption made: top 3 databases
were assumed to be Pinecone, Weaviate, Qdrant without user confirmation.

## ⚡ What Was Done

### Claude
- Defined 6-criteria comparison framework
- Wrote full comparison doc with matrix and recommendation
- Applied post-review corrections

### GPT-4o
- Full research sweep on Pinecone, Weaviate, and Qdrant
- Reviewed final document — caught performance caveat and Weaviate differentiator

## 💡 Insights & Findings
- **Pricing trap:** Pinecone's pod-based model surprises teams at scale — most
  expect query-based pricing
- **Performance vs control:** Qdrant leads benchmarks but trades simplicity for
  performance
- **Multimodal niche:** Weaviate is clearly differentiated for image+text use
  cases — others don't offer this
- **Review step added real value:** Two improvements caught that weren't in
  the initial draft

## ✅ Deliverables
- `vector-db-comparison.md` — full comparison document with matrix and recommendation

## ❓ Open Questions / Next Steps
- User's actual deployment preference (cloud vs self-hosted) should guide
  final recommendation
- Budget constraints would change the calculus toward Qdrant or Weaviate
- Confirm top-3 database selection was correct

## 📝 Notes on Collaboration
Parallel track approach worked efficiently. Review protocol caught two genuine
improvements. Next time: confirm assumptions with user earlier in Plan Mode.
```