# OracleDBPiAgent

An Oracle Database 19c assistant for DBAs and developers. It is built on the
[PI agent SDK](https://www.npmjs.com/package/@earendil-works/pi-agent-core) and runs
entirely on this machine. It uses the local Strata LLM and the local Docker 19c
databases inherited from OracleDBHarness. The MVP is read-only.

See [PLAN.md](PLAN.md) for scope, architecture and status, and [AGENTS.md](AGENTS.md)
for the rules coding agents follow.

## Quick start

```bash
npm ci
cp .env.example .env
node --env-file=.env --import tsx src/cli/index.ts doctor
node --env-file=.env --import tsx src/cli/index.ts ask "Which HR employees earn more than their manager?"
```

Requirements:

- Strata loaded at `http://127.0.0.1:8080` (`curl -s http://127.0.0.1:8080/health`).
- Docker containers `oracle19c` (:1522) and `oracle19c-prod` (:1523) healthy.
- Password files in `PIAGENT_SECRET_DIR`.
