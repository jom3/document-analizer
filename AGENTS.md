# AGENTS.md

## Current State

- This repo is **pre-code**: only `README.md` exists. No package manifests, source, or tests yet.
- Not a git repo yet.

## Project Direction

- Full-stack AI document intelligence app. Source of truth for vision/scope: `README.md`.
- Development follows **Spec-Driven Development** — write specs before code. The `spec` / `spec-impl` skills apply here.

## Intended Stack (from README)

- Frontend: Angular + TypeScript (Signals, Router, Reactive Forms).
- Backend: NestJS + TypeScript, REST API, JWT auth.
- Database: PostgreSQL via Prisma ORM (pgvector planned later for RAG).
- AI: OpenAI API (analysis, structured outputs, embeddings, RAG).
- Infra: Docker + Docker Compose, local file storage for dev.

## Architecture Conventions

- **Modular monolith** — not microservices.
- Design philosophy: avoid unnecessary complexity. Do not introduce microservices, Kubernetes, Kafka, agents, fine-tuning, or multi-provider AI unless a real requirement demands it.
- Document types (invoices, resumes, contracts, generic) must be extensible without redesign.

## Gotchas

- No build/lint/test commands exist yet; do not invent `npm run ...` steps until scaffolding is in place.
- When scaffolding begins, set up the two apps (Angular frontend / NestJS backend) as separate packages under a shared root.
