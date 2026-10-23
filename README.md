# Explain Your Build

**You built it. Can you explain it?**

A code-grounded AI mock interviewer for students who list projects on their résumé but freeze when someone asks how the project actually works.

Built for the YouthTech Texas A&M Kiro Hackathon.

## MVP flow

1. Paste a **public GitHub repository URL**.
2. The server reads a small, bounded set of source files and pins the exact commit.
3. Amazon Bedrock generates three interview questions tied to real files and line ranges.
4. The student answers while looking at the highlighted code.
5. Bedrock gives grounded coaching and asks a deeper follow-up question.

The app never installs or executes the analyzed repository.

## Stack

- Next.js + React + TypeScript
- GitHub REST API and commit-pinned raw source reads
- Amazon Bedrock Converse API through the AWS SDK for JavaScript v3
- Amazon Nova Lite by default in `.env.example`
- Kiro V3 for implementation planning and iteration

AWS documents `amazon.nova-lite-v1:0` as a Nova Lite model ID for Bedrock Converse, but workshop permissions still determine whether the event role can invoke it.

## Local setup

Requirements:

- Node.js 20.9+
- AWS CLI credentials from Workshop Studio exported in the same shell
- Bedrock access in `us-east-1`

Run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

Before launching the app, refresh the temporary Workshop Studio credentials in your shell. Do not commit them.

Recommended validation:

```bash
npm run typecheck
npm run build
```

## Security and privacy choices in the MVP

- Only `https://github.com/owner/repository` URLs are accepted.
- GitHub requests are server-side and constrained to GitHub-owned hosts.
- Repository revisions are pinned before raw files are fetched.
- File count, per-file size, total source size, and request sizes are bounded.
- Generated question file paths and line ranges are validated against fetched source.
- Prompt instructions explicitly treat repository content as untrusted data.
- AWS credentials and Bedrock calls remain server-side.
- No database is used yet; the application intentionally does not persist student answers.

## Important production gap

This is a working hackathon MVP, not yet a production-certified deployment.

Before claiming full production readiness, add:

- server-side interview sessions so the client cannot substitute code during feedback
- durable distributed rate limiting and AWS WAF
- monitoring, alarms, cost controls, and a tested Bedrock failure strategy
- automated integration and end-to-end tests
- a privacy/data-retention policy
- GitHub App authentication for private repositories
- accessibility and threat-model review
- deployment validation in the event AWS account

## Kiro

Project guidance lives in `.kiro/steering/product.md`.

Launch Kiro from the repository root:

```bash
AWS_DEFAULT_REGION=us-east-1 kiro-cli --v3
```

Keep AWS mutations approval-gated. Do not grant blanket trust to `aws *` during development.
