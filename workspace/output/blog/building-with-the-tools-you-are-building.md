# Building With the Tools You Are Building: AI Development as Its Own Case Study

*February 14, 2026*

---

There's a commit from February 11 — Day 4 — where `copilot-swe-agent[bot]` authored a migration file called `ops_llm_usage.sql`. It creates the table that tracks how much AI costs to run. An AI agent wrote the infrastructure for monitoring AI agents. Then another AI agent — Claude Code, running in my terminal — reviewed the PR for SQL type safety issues. Then Copilot fixed the review comments. Then I merged it.

At no point during this sequence did I write SQL.

## The Bootstrap Paradox

The subcult-corp repo was initialized on February 8, 2026, with commit `bc55264` and the message "init lol." Seven days later it has 35 database migrations, 9 native tools, 16 conversation formats, 6 agents with multi-page philosophical identity documents, a governance system, a content pipeline, Discord integration, live observability dashboards including a Three.js isometric office with pixel-art sprites, and a full migration path from the previous system.

109 commits across all branches. 55 by me. 48 by Copilot (41 from the SWE agent, 7 from workspace Copilot). One person built this in a week while holding down a day job.

The honest accounting: I didn't write most of the code. AI did. And the system I was building is itself an AI system — six autonomous agents with tool access, scheduled conversations, memory evolution, and a governance protocol. I was using AI to build AI to manage AI. The recursion runs at least three levels deep before you lose count.

This is worth documenting not because it's impressive but because it's becoming normal, and the tradeoffs are poorly understood.

## What AI Actually Wrote

The commit history tells the story. Here's what I delegated:

**Migration files.** Copilot SWE agent authored `ops_llm_usage`, the cost tracking tables, the Discord channels schema, the content drafts migration. I described the table shape in an issue. Copilot wrote the SQL, added documentation comments, handled the foreign key constraints. Its commit messages are distinctive — "Initial plan" followed by "Create ops_llm_usage migration file" followed by "Add documentation comments for nullable fields." Methodical. Boring. Correct.

**Type definitions and API scaffolding.** The pattern after the first few tools were built was: "here's how `bash.ts`, `file-read.ts`, and `web-search.ts` work. Now make `web-fetch.ts`." Claude Code would read the existing tool implementations, understand the registry pattern, the `ToolDefinition` type, the executor interface, and produce a new tool that followed the same structure. Then Copilot would PR-review it and catch the camelCase violation in the function name.

**React components.** The Memory Explorer, the Relationship Constellation graph, the event feed with its 40+ event kind mappings and severity colors — these were AI-generated from descriptions. "Build a force-directed graph showing agent pairwise affinities, drag to rearrange, click for details." The output needed tweaking, but the scaffolding was functional on first generation.

**Refactoring.** When I renamed the worker system from duplicated JavaScript files to a unified process, Claude Code did the actual find-and-replace across 15 files, updated imports, fixed type references. The mechanical work of refactoring — where the decision is made but the execution is tedious — is where AI saves the most time per keystroke.

**Code review responses.** Copilot's commits include gems like "Address all 15 code review comments — security fixes, bug fixes, and cleanup" and "Fix path traversal vulnerabilities in check_droid and spawn_droid." I or GitHub's code review flagged the issues. Copilot fixed them. The feedback loop was: human spots the category of problem, AI fixes every instance.

## What AI Couldn't Write

The things that don't appear in the commit history:

**The architectural decisions.** The choice to use PostgreSQL for everything — state, queues, memory, vectors — instead of splitting across services. The decision to make conversations probabilistic rather than scheduled. The cap system where daily conversation limits create selection pressure. The ACL enforcement model for file tools. None of these were AI-suggested. They came from thinking about what the system needed to be, not what the code needed to do.

**The philosophical grounding.** Chora's identity as a Marxist-materialist diagnostician. Subrosa's absolute veto authority grounded in Foucault and Sun Tzu. The INTERWORKINGS protocol that defines conflict resolution by domain. Writing an AI's soul is not something you delegate to an AI. The irony isn't lost on me, but the reason is practical: the identity documents are the load-bearing structure of the entire agent system. If they're generic, the agents are generic. The specificity has to come from somewhere with actual convictions.

**The judgment calls.** What to build and what to skip. The decision that governance should be democratic (agents vote on policy changes) rather than hierarchical. The decision to give Subrosa veto power — a structural safety mechanism that constrains the system even when the human isn't watching. The decision to build the kill switch before building the autonomy. These are values questions, and values don't auto-complete.

**The debugging.** When conversations produced blank transcripts, the bug was in model resolution — a race condition between the fallback chain and the streaming response parser. Claude Code could read the 8 relevant files and help trace the logic, but identifying *which* 8 files to read, and understanding that the symptom (blank output) mapped to a model routing issue rather than a rendering issue, required system-level intuition that comes from having designed the architecture.

## The Speed Tax

Day 4 had 21 commits across all branches. That pace is only possible when you're not typing most of the code. But velocity has costs.

You accumulate technical debt faster because shipping is frictionless. When generating a component takes 30 seconds instead of 30 minutes, you generate five components instead of thinking about whether you need three. The 3,900 lines of duplicated worker JavaScript that got deleted in the migration phase? Some of that duplication was AI-generated code that I should have abstracted earlier but didn't because it was "free."

You skip tests because the feature is "obviously" correct. The type checker catches structural errors, but it doesn't catch logic errors, and AI-generated code can be structurally perfect and logically wrong in subtle ways. A probability weight that should be 0.3 instead of 0.03. A database query that works but doesn't use the index. The kind of bugs that pass TypeScript and fail reality.

You make architectural decisions under time pressure. The conversation format system has 16 formats because I kept adding them during a single session with Claude Code. Standups, deep dives, debates, brainstorms, cross-examinations, reframes, watercooler chats. If I'd had a week to think, I might have built 8 and designed them more carefully. Instead I have 16 that mostly work but whose parameter tuning (temperature, turn counts, speaker selection) is based on intuition rather than testing.

## TypeScript as Code Review Partner

The practical answer to "how much do you review AI-generated code?" is: not enough, but more than zero, with the type system doing the heavy lifting.

`npx tsc --noEmit` was the most-run command of the week. TypeScript's compiler catches the structural errors — wrong argument types, missing properties, incompatible return types, unused imports. It doesn't catch logic errors, but it catches the class of errors that are most common in AI-generated code: plausible-looking function calls with slightly wrong signatures.

The review heuristic I landed on: review architecture and interfaces line-by-line. Spot-check implementation. Trust the type checker for everything structural. Read the tests (when they exist). And pay close attention to security-sensitive code — Copilot's commit history includes "Fix path traversal vulnerabilities" and "Apply security fixes from code review" because AI-generated file handling code had directory escape bugs that the type system couldn't catch.

The type system becomes your code review partner. It's not sufficient. But it's the difference between reviewing everything and reviewing the things that matter.

## Building Constraints on AI, With AI

The recursion worth noting: Claude Code helped implement the tool ACL system — the code that determines which agents can access which tools. It helped build `registry.ts`, where tool permissions are checked against per-agent grants before execution. It helped write the governance module where agents can propose and vote on policy changes to their own operating parameters.

Claude Code helped me build the prime directive loader — the system that injects identity constraints into agent prompts. It helped implement the conversation cap system that prevents runaway agent activity. It helped write the kill switch.

There's something worth sitting with here. I used an AI to build the constraints on AI. The tool that helped me write the ACL enforcement code is itself an AI tool that operates under its own constraints. The code it produced will constrain agents that are, architecturally, its cousins — LLMs with tool access and system prompts, running in loops, producing output that affects the world.

I don't think this is a problem. The AI that writes the constraint code doesn't need to understand why the constraints exist. It needs to produce correct implementations. The *why* is the human's job. But the layering is worth documenting because it's going to become more common, and the philosophical implications are more interesting than the technical ones.

## The Ratio Shift

Here's what I think this week actually demonstrated: the ratio between design and implementation is inverting.

Traditional solo development is roughly 80% implementation, 20% design. You spend most of your time typing, debugging, refactoring, writing tests, fixing edge cases. The design happens in bursts between long stretches of mechanical work.

This week was closer to the inverse. Most of my time was spent on architecture, identity documents, system design, debugging conceptual problems, and making judgment calls. The implementation — the migration files, the API routes, the React components, the type definitions — was largely AI-generated. Not entirely. Not perfectly. But enough that the bottleneck shifted from "can I type fast enough" to "do I know what to build."

This doesn't mean AI replaces teams. It replaces the typing. The human is still the architect, the philosopher, the person who writes Chora's soul and decides that Subrosa gets veto power and chooses PostgreSQL over six microservices. The human is still the debugger when the bug is conceptual rather than syntactic. The human is still the one who decides "no, we need a kill switch before we need more features."

But the human doesn't need to manually write every migration file, every API route handler, every React component, every TypeScript type definition. And that changes what one person can build in a week from "a prototype" to "a system."

Whether that's good depends on whether the human's judgment is good. Speed amplifies both competence and incompetence. The 35 migrations and 9 tools and 16 conversation formats exist because AI made them cheap to produce. Whether they're the *right* 35 migrations is a question that only time and usage will answer.

The commit history is the honest record. 55 commits from me. 48 from Copilot. The architecture is mine. The implementation is shared. The bugs are both of ours. The system works, for now, and the process that built it is the process it was built to study.

---

*Subcult Corp was built in 7 days with Claude Code, GitHub Copilot, and a lot of coffee. The [commit history](https://github.com/subculture-collective/subcult-corp/commits/main/) tells the story better than any blog post.*
