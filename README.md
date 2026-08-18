# AI Document Intelligence

AI-powered platform for analyzing and understanding documents using Large Language Models.

The application allows users to upload documents, automatically process their content, extract relevant information, generate summaries, and interact with the documents using natural language.

The main goal is to build a **small but complete AI-powered software product**, demonstrating how artificial intelligence can be integrated into a real full-stack application.

---

## Purpose

The purpose of this project is to create a document intelligence platform capable of transforming unstructured documents into useful and structured information.

Instead of simply uploading a PDF and sending its content to an AI model, the application will provide a complete workflow:

```text
Document
   ↓
Processing
   ↓
Text extraction
   ↓
AI analysis
   ↓
Structured information
   ↓
User interaction
```

For example, a user could upload an invoice and obtain:

```text
Document type: Invoice

Supplier: Empresa X
Customer: Empresa Y
Date: 12/08/2026
Total: Bs 4,850

Summary:
Invoice for products and services...
```

The system will eventually allow the user to ask questions about the document and receive answers supported by the relevant pages or sections.

---

## Main Features

The project will progressively support:

* Secure user authentication
* Document upload and management
* PDF processing
* Text and page extraction
* Automatic document classification
* AI-generated summaries
* Structured information extraction
* Document-specific analysis
* Natural-language questions about documents
* Source and page references
* Semantic search
* Retrieval-Augmented Generation (RAG)
* Asynchronous document processing

Additional features may be added later, such as OCR, document comparison and exporting results.

---

## Document Types

The initial version will focus on a small number of document types:

* Invoices
* Resumes / CVs
* Contracts
* Generic documents

The system should be designed so that additional document types can be introduced without redesigning the entire application.

---

## How It Works

The basic workflow is:

```text
1. User uploads a document
          ↓
2. Document is stored
          ↓
3. The system extracts its content
          ↓
4. AI identifies the document type
          ↓
5. Relevant information is extracted
          ↓
6. A summary and analysis are generated
          ↓
7. The user can explore the results
          ↓
8. The user can ask questions about the document
```

For questions about a document, the future RAG system will retrieve the most relevant sections before generating an answer.

This allows the application to provide not only an answer, but also the source from which the information was obtained.

---

## Technology Stack

### Frontend

* Angular
* TypeScript
* Angular Signals
* Angular Router
* Reactive Forms

### Backend

* NestJS
* TypeScript
* REST API
* JWT Authentication
* Prisma ORM

### Database

* PostgreSQL

PostgreSQL will be used as the main relational database.

Later, **pgvector** may be added to support semantic search and Retrieval-Augmented Generation.

### Artificial Intelligence

* OpenAI API
* LLM-based document analysis
* Structured outputs
* Embeddings
* Retrieval-Augmented Generation

### Infrastructure

* Docker
* Docker Compose
* Local file storage during development

Redis and BullMQ may be introduced later for asynchronous document processing.

---

## Architecture

The project will use a **modular monolith architecture**.

The initial architecture is intentionally simple:

```text
                    ┌───────────────┐
                    │    Angular    │
                    │   Frontend    │
                    └───────┬───────┘
                            │
                            │ REST API
                            ▼
                    ┌───────────────┐
                    │    NestJS     │
                    │    Backend    │
                    └───────┬───────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │ PostgreSQL   │      │   OpenAI     │
          │ + Prisma     │      │     API      │
          └──────────────┘      └──────────────┘
```

As the project evolves, additional infrastructure may be introduced:

```text
PostgreSQL
     +
pgvector
     +
Redis
     +
BullMQ
```

These technologies will only be introduced when they solve an actual requirement of the application.

---

## Project Evolution

The project will be developed progressively.

### Foundation

Establish the application architecture, database, authentication and document management.

### Document Intelligence

Add PDF processing, AI classification, summarization and structured data extraction.

### RAG & Document Chat

Add embeddings, semantic search and the ability to ask questions about documents with source references.

### Advanced Processing

Introduce asynchronous processing, queues and workers.

### Future Extensions

Potential future capabilities include:

* OCR
* Additional document formats
* Document comparison
* Data export
* AI-generated insights
* Human verification of extracted information

---

## Design Philosophy

The project intentionally avoids unnecessary complexity.

It will **not** initially use:

* Microservices
* Kubernetes
* Kafka
* Complex AI agents
* Fine-tuning
* Multiple AI providers
* Large distributed infrastructure

The objective is to build a **well-structured, maintainable and realistic AI application**, not to maximize the number of technologies used.

---

## Portfolio Purpose

This project is intended to demonstrate modern full-stack and AI engineering skills.

It should demonstrate the ability to:

* Design and build a complete web application
* Work with Angular and NestJS
* Design relational databases with PostgreSQL
* Use Prisma for data persistence
* Build secure APIs
* Handle file uploads and processing
* Integrate Large Language Models
* Work with structured AI outputs
* Implement RAG and semantic search
* Design asynchronous processing workflows
* Use Docker for local development
* Build software around AI rather than simply consuming an AI API

The main objective is to demonstrate **how AI can become part of a real software architecture**.

---

## Development Setup

For local development only PostgreSQL and Redis run in **standalone containers**, independent of the project, so you can start and stop them without affecting the code. The backend and frontend run natively with `npm run dev`. To run the **whole stack in Docker** (production/portfolio mode), see [Deployment (Docker)](#deployment-docker) below.

### Local database (PostgreSQL container)

Start a persistent PostgreSQL container on port `5433` (host) → `5432` (container):

```bash
docker compose up -d
```

This creates the `db` service defined in `docker-compose.yml` (root): image `postgres:18.4-alpine3.24`, credentials `postgres`/`postgres`/`document_analyzer`, port `5433`, and a named volume (`document-analyzer-db-data`) so data survives container restarts.

Stop it with `docker compose down` (use `docker compose down -v` only if you also want to delete the data).

Equivalent one-liner without Compose:

```bash
docker run -d \
  --name document-analyzer-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=document_analyzer \
  -p 5433:5432 \
  -v document-analyzer-db-data:/var/lib/postgresql \
  postgres:18.4-alpine3.24
```

Note: Postgres 18 stores data in version-specific subdirectories, so the volume must be mounted at `/var/lib/postgresql` (not `/var/lib/postgresql/data`).

The backend connects to it through `DATABASE_URL` (see `apps/backend/.env.example`):

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/document_analyzer?schema=public"
```

---

## Deployment (Docker)

The whole stack (PostgreSQL, Redis, backend and frontend) can run in Docker with a single command. The frontend is served as a static build by nginx, which also proxies `/api` to the backend.

### 1. Prepare the environment file

Copy the template and fill in the real secrets:

```bash
cp .env.example .env
```

Required values: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OPENAI_API_KEY`. `RESEND_API_KEY` is only needed for password recovery and email verification emails.

> Set `NODE_ENV=production` only when deploying behind HTTPS/TLS: it enables `Secure` cookies on the backend. Leave it unset for local testing over `http://localhost:4200`.

### 2. Build and start the stack

```bash
docker compose up -d --build
```

This builds the multi-stage images (backend on Node 24, frontend on nginx) and starts all services. The first build downloads dependencies and may take a few minutes.

### 3. Check the status

```bash
docker compose ps
```

All services should show `healthy`:

```text
NAME                         STATUS
document-analyzer-db         Up (healthy)
document-analyzer-redis      Up (healthy)
document-analyzer-backend    Up (healthy)
document-analyzer-frontend   Up (healthy)
```

- Frontend: http://localhost:4200
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

### 4. Stop the stack

```bash
docker compose down
```

Data is preserved in the named volumes (`document-analyzer-db-data`, `document-analyzer-redis-data`, `document-analyzer-storage`). Use `docker compose down -v` only if you also want to delete all data.

### Notes

- The development flow (`npm run dev` + `proxy.conf.json` + PostgreSQL/Redis containers) is unchanged; Docker mode is an additional way to run the application.
- Ports are the same as development: `3000` (backend), `4200` (frontend), `5433` (PostgreSQL), `6379` (Redis).
- Uploaded documents persist in the `document-analyzer-storage` volume.

---

## Project Status

The project is being developed incrementally using a **Spec-Driven Development** approach.

The README defines the overall vision and direction of the project.

Detailed implementation decisions, requirements and acceptance criteria will be defined separately in the project specifications.

---

## License

This project is intended as a personal portfolio project.
