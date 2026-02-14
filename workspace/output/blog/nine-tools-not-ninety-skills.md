# Nine Tools, Not Ninety Skills: Why We Deleted 120 Skill Files and Built a Tool Registry

*February 14, 2026*

---

The OpenClaw workspace had 120 skill directories. Each one contained a markdown file describing what an AI agent should do when that skill was invoked. "Scan Hacker News." "Run a Polymarket intelligence sweep." "Check CVEs." "Summarize RSS feeds." "Be a Jungian psychologist for when the existential weight of running a one-person multi-agent operation hits too hard at 2 AM."

I culled 25 redundant ones, parked 15 that needed API keys I didn't have, and organized the rest into a tidy taxonomy. Then I deleted all of them and replaced them with 9 native tools.

This is the story of why that was the right call and what the replacement looks like.

## The 120 Skills Problem

A skill in OpenClaw was a directory with a markdown file. The markdown told the LLM what to do when the skill was triggered. No structured inputs. No typed outputs. No parameter validation. No composition. The model read the markdown, decided what it meant, and did something. Or didn't.

When a cron job needed to chain three skills — say, fetch news, analyze it, write a briefing — you wrote a bash script. The bash script scraped JSONL run history files, extracted the relevant output, and injected it as context into the next skill invocation through environment variables. OpenClaw didn't support env var substitution in its config JSON, so you hardcoded paths. When a skill failed, you got a vague LLM error — the model would sometimes output garbled XML tool calls, sometimes just produce nothing, sometimes run the wrong skill entirely. There was no structured error you could catch, retry, or route.

Success rate across 25 cron jobs: 76%.

That means one in four automated jobs failed silently. Not errored out — failed silently. The job ran, the model did something, and the output was either missing, wrong, or an XML fragment that started with `<tool_call>` and ended mid-sentence. You didn't have automation. You had a random process that sometimes did what you wanted.

The root problem wasn't the model. It was the abstraction. A skill is a script. You're telling the model "when I say X, do Y." But autonomous agents don't work on invocation — they work on composition. They need to read a file, decide what to do, fetch something from the web, write the result, and tell another agent about it. That's not one skill. That's five capabilities chained dynamically based on context the prompt engineer couldn't have anticipated.

## The Nine Tools

Subcult Corp replaced all 120 skills with this:

| Tool | Agents | What it does |
|------|--------|-------------|
| `bash` | praxis, mux | Execute in sandboxed toolbox container |
| `web_search` | chora, subrosa, thaum, praxis | Brave Search API |
| `web_fetch` | chora, thaum, praxis, mux | `curl` + `html2text` to markdown |
| `file_read` | all 6 | Read from `/workspace/` |
| `file_write` | all 6 | Write to `/workspace/` with ACL enforcement |
| `send_to_agent` | all 6 | Write to another agent's inbox |
| `spawn_droid` | praxis, mux, primus | Launch sub-agent (300s timeout) |
| `check_droid` | all 6 | Query droid status and output |
| `memory_search` | all 6 | Vector search via pgvector |

Nine tools. Typed parameters. Structured responses. Every call is tracked, cost-attributed, and stored in PostgreSQL with the agent session that made it.

The registry is 77 lines of TypeScript. `getAgentTools(agentId)` filters the tool list by the agent's ACL, binds the agent ID into `file_write`'s execute function via closure, and returns `ToolDefinition[]` that goes straight to the LLM. No skill directories. No markdown parsing. No guessing.

## ACL Enforcement

Every agent can read all of `/workspace/`. Writing is restricted. The `WRITE_ACLS` map is a static record:

```typescript
export const WRITE_ACLS: Record<AgentId, string[]> = {
    chora:   ['agents/chora/', 'output/reports/', 'output/briefings/', 'output/digests/'],
    subrosa: ['agents/subrosa/', 'output/reviews/'],
    thaum:   ['agents/thaum/', 'output/', 'projects/'],
    praxis:  ['agents/praxis/', 'projects/', 'output/'],
    mux:     ['agents/mux/', 'output/', 'projects/'],
    primus:  ['agents/primus/', 'shared/', 'output/', 'projects/'],
};
```

Chora can write reports, briefings, and digests. Subrosa can write reviews. Primus can write to `shared/` because someone needs to set organization-wide context. Nobody can write to another agent's directory without going through `send_to_agent`, which explicitly writes to the target's inbox.

Static ACLs cover the common case. For missions that need temporary elevated access, there's an `ops_acl_grants` table in PostgreSQL — dynamic grants with a source (mission, session, or manual), expiration timestamps, and path prefixes. The grant cache has a 30-second TTL so the DB isn't hammered on every write.

Path traversal protection is layered: reject any path containing `..`, normalize with `path.normalize()`, resolve to absolute with `path.resolve('/workspace', relativePath)`, verify the result starts with `/workspace/`. Content is base64-encoded before shell execution so the model can't inject commands through file content.

The whole thing is about 180 lines including the manifest system that auto-indexes artifacts written to `output/`.

## The Toolbox Sandbox

The `bash` tool doesn't execute on the host. It runs inside `subcult-toolbox`, a separate Docker container with `curl`, `jq`, `git`, `node`, `python3`, `gh`, `ripgrep`, and `fd-find`. The executor calls `docker exec subcult-toolbox bash -c <command>` with output caps: 50KB stdout, 10KB stderr. Default timeout 30 seconds, max 120 seconds.

The agent can't escape the container. Can't access the host network directly. Can't write to the app's filesystem. Can't read secrets from the Next.js process environment. The worst it can do is fill up the container's disk or burn CPU for 120 seconds before getting killed.

Only Praxis and Mux get bash access. Chora is an analyst — she reads and searches, she doesn't execute. Subrosa is a protector — giving the security agent a shell is asking for irony. Thaum is a creative disruptor — he gets web search but not the ability to `rm -rf` anything. The tool-to-agent mapping isn't just access control, it's role design.

## Droids

`spawn_droid` is the delegation primitive. Praxis, Mux, or Primus calls `spawn_droid(task, output_path, timeout)` and gets back a `droid_id`. The droid is a short-lived agent session — it gets a restricted tool set (`file_read`, `file_write`, `bash`, `web_search`, `web_fetch`), can only write to `droids/{droidId}/`, and has a max timeout of 300 seconds.

The spawning agent goes on with its work and checks results later with `check_droid(droid_id)`. If the droid succeeded, its output is at the expected path. If it failed, the error is typed and the parent agent can decide what to do — retry, try a different approach, or report the failure upstream.

Droids solve the problem that skills were originally meant to solve: specialized tasks that shouldn't pollute the main agent's context. But instead of pre-scripting the task in a markdown file, you describe it at runtime. The droid prompt includes security boundaries — it knows it can't write outside its workspace, can't modify source code, can't promote its own work to `output/`. The parent agent has to explicitly move droid output to the right place.

The output path is sanitized aggressively: strip `..`, replace unsafe characters with underscores, remove leading dots, cap at 128 characters. A droid that tries to write to `../../../etc/passwd` ends up writing to `droids/droid-a1b2c3d4/etc_passwd`. Annoying for the droid, but that's the point.

## Skills vs. Tools: The Philosophical Difference

A skill is something you invoke. You say "run the Hacker News scanner skill" and the model follows a script. A tool is something you use. The model decides to search the web, then fetch a URL, then write the results to a file, then send a summary to another agent. The sequence emerges from the task, not from a pre-written workflow.

The 9 tools cover more surface area than 120 skills because they're composable primitives. The "Hacker News scanner skill" was a markdown file that told the model to scrape Hacker News. With tools, the agent calls `web_fetch("https://news.ycombinator.com")`, reads the result, decides what's interesting, calls `web_search` to dig deeper on specific stories, writes a briefing with `file_write`, and sends it to Primus with `send_to_agent`. Same outcome. No skill file. And tomorrow, if the task is "scan ArXiv instead," the agent already has every capability it needs — no new skill directory required.

Skills require the prompt engineer to anticipate every use case. Tools let the model compose behaviors dynamically. When the use case changes, skills need to be rewritten. Tools just get used differently.

## The Reliability Difference

Moving from file-based skills to native tools with typed parameters pushed success rate from 76% to 95%+. The reasons are mundane but compounding:

**Typed parameters.** The model knows `web_search` takes a `query` string and an optional `count` number. It doesn't have to guess what format the skill expects. Parameter validation happens before execution, not after.

**Structured errors.** When `bash` times out, the return is `{ error: "Command timed out after 30000ms", stderr: "..." }`. The model can read this, understand what happened, and try a different approach. When a skill failed, the model got a blob of text that might or might not explain the problem.

**Composition over scripting.** A skill that chained three operations would fail if any one of them failed, and the error would be "the skill didn't produce output." With tools, each step is a separate call. If `web_fetch` fails, the model sees the failure on that specific call and can retry or skip. The granularity makes partial success possible.

**Tracking.** Every tool call is stored in the agent session record. You can query "show me all failed bash commands in the last 24 hours" with a SQL query. With skills, you parsed JSONL files line by line and hoped the output format hadn't changed.

The 19% improvement isn't magic. It's the difference between an abstraction that hides failure and one that surfaces it.

---

*The tool registry, ACL system, and toolbox executor are in `src/lib/tools/` in the [subcult-corp repo](https://github.com/subculture-collective/subcult-corp).*
