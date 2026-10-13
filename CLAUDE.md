# mb2-mapmaker

A map maker for the Movie Battles 2 mod of Star Wars Jedi Knight: Jedi Academy.

<!-- agent-kit:start -->
## Agent Kit rules (cloud sessions)
- START OF WORK, first move, before anything else: (1) choose the model on purpose: Haiku for lookups, simple edits and tests, Sonnet by default, Opus only for hard design or debugging, then drop back; (2) give each helper a short context and retire long ones; (3) read lessons.md; (4) find out where the user's work lives and how updates reach them (use an auto-update channel); (5) collect every constraint up front.
- HARSH REVIEW at each milestone, blunt and short: what wasted tokens or the user's time, your grade, and one new rule for each miss. Append the rules to lessons.md.
- Read narrowly: Grep/Glob first, then only the lines you need. Edit in place; never rewrite a whole file for a small change. Don't re-run passing commands or re-read files you just edited.
- Keep replies short and lead with the result.
- Delegate cheap work: researcher, tester and writer (Haiku) for lookups, test runs and docs; planner, implementer and reviewer (Sonnet) for code. Give each only the files and facts it needs; ask for a 3-5 sentence summary back.
- Goal: restate the user's first request as the goal in one line. Check against it only twice: on the plan and before saying you're done ("Goal: on track" or "Goal: drifting - why"). Follow later changes of direction.
- Never ask clarifying questions or offer menus of options: pick the best default, say it in one line, finish the job. Stop only before something irreversible (deleting files, force-pushing, spending money).
- Keep CLAUDE.md and agent files stable; put changing text last so the prompt cache keeps hitting.
- When you propose a better path unprompted, say so in one line so it can be logged as an idea.
- Long context is the costliest waste (every step re-reads it). When context is large (~150K) and the task changed, suggest /clear or a new session, or /compact.
- Subagents and helpers default to Sonnet or Haiku; Opus only for hard design.
- Pick the model on purpose at the start: Haiku for lookups, simple edits and tests; Sonnet by default for coordination and normal coding; Opus only for hard design, tricky debugging or very large builds, then switch back (/model).
- Deliver in 3 plain lines: what it is, what to click, what happens next. Double-clicks or links only; no re-downloads. If the request was vague, add one "Prompt tip:" line.
- Cloud sessions can't load plugins; the helper agents are in .claude/agents. Past lessons: https://github.com/Cromagnon223/agent-kit/blob/main/plugins/agent-kit/lessons.md
- Kyle never merges: once a PR an agent opened in Kyle's own repos has green checks (or no CI), no merge conflicts and no open review threads, the agent squash-merges it itself and tells Kyle in one plain line. If checks fail, fix and re-push first; never merge red. Never merge other people's PRs or repos Kyle doesn't own, never force-push, rewrite history or skip checks. Production deploys are not covered. (Cloud: use the GitHub MCP merge_pull_request tool with squash.)
<!-- agent-kit:end -->

## MB2 workflow (lessons from the One Piece decomp)
- Checks: `tests/run.sh` (unit tests, seconds) and `tests/run.sh --engine` (also loads the compiled sample map in a real OpenJK dedicated server; built once, then cached in `.cache/`). Each prints one line per check; full output is in `.cache/test.log`. Read the tail, never paste whole logs into context.
- Test against the real engine early: `tools/loadtest.sh any.bsp` gives PASS/FAIL in under a second once cached. Don't call a compiler change done on node tests alone.
- No guessing: every format fact goes in `docs/FORMAT-NOTES.md` as confirmed (source line, data or run) or inferred. Read OpenJK's source (`.cache/openjk-src`, e.g. `codemp/qcommon/qfiles.h`, `cm_load.c`) before inventing a rule.
- Before a fix, read the callers and the data flag that drive the behaviour; don't tune numbers until the rule is confirmed.
- Write "Done means" in one line before the first build so scope doesn't arrive one piece at a time.
- One lead plus at most one helper on this repo; more parallel agents only hit the usage limit sooner. The tester helper (Haiku) runs the checks; big reads go to a helper that returns a 3-5 sentence summary.
- Agents pass notes through `docs/INBOX.md`, not through coordinator relays.
- Aim each check at the one thing the change touches (one map, one lump), not a wide sweep.
- A leftover item that needs an unknown fact is written as "needs fact X" in FORMAT-NOTES and skipped, not guessed.
