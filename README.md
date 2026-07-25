# Page Pulse

A production-grade URL audit service — built for the Digital Heroes SDE qualification task (Task A & Task B).

Given a URL, it reports status code, response time, HTTPS/security-header hygiene, and on-page basics (title, meta description, heading counts, image alt coverage, internal link count, word count).

It now serves a complete, modern, single-page web interface at the root endpoint to let users run audits interactively.

---

## Features

### 1. Modern Web Interface (`/`)
Instead of a barebones text page, the service serves a premium, glassmorphism dashboard:
*   **Live Server Health Monitor**: Querying `/health` dynamically every 10 seconds to display active tasks, queues, and cache hit ratios with a breathing online indicator.
*   **5-Step Progress Wizard**: Visualizes audit milestones (URL parsing, SSRF DNS checks, fetch requests, DOM analysis, and report compiling) using keyframe loaders.
*   **Overall Performance Score**: Computes a site health grade (A to F) based on connection status, HTTPS secure check, critical security headers, SEO metatag lengths, and image accessibility alt tag coverage.
*   **Detailed Metrics Grid**: Displays response times (color-coded fast/medium/slow), security header validation (HSTS, CSP, XFO), heading counts (H1, H2), word count, and internal links.
*   **Alt Tag Coverage Meter**: Progress bar illustrating the percentage of images containing `alt` attributes.
*   **Interactive Suggestion Chips**: Quick-start templates to test standard, secure, failing, and localhost (SSRF blocked) audits instantly.
*   **Raw JSON Inspector**: Collapsible code block showing pretty-printed JSON data for developer debugging.

### 2. Production-Grade Backend Resilience

| Concern | How it's handled |
|---|---|
| **Input validation** | Well-formed URL check, protocol allowlist (`http`/`https` only), and an SSRF guard that resolves DNS and blocks private/loopback/link-local IP ranges |
| **Timeouts** | Every outbound fetch is wrapped in an `AbortController` with a configurable hard timeout — a slow target can't hang a request indefinitely |
| **Concurrency limits** | A dependency-free semaphore caps in-flight audits (`MAX_CONCURRENT_AUDITS`); requests beyond that queue, and the queue itself has a fail-fast ceiling instead of growing unbounded |
| **Structured errors** | Every error response is `{ error: { code, message, requestId } }` — never a raw stack trace or an inconsistent shape |
| **Caching** | Repeat audits of the same URL within `CACHE_TTL_SECONDS` are served from an in-memory TTL cache instead of refetching |
| **Rate limiting** | Per-client limiting (keyed on `X-Client-Id` header, falling back to IP) via `express-rate-limit` |
| **Logging** | Structured JSON logs (`pino`) with a request ID attached to every log line and returned in the `X-Request-Id` response header, so a single request can be traced end-to-end |
| **Tests + CI** | Jest/Supertest suite covering validation, success paths, caching, timeouts, upstream failures, and rate limiting; GitHub Actions runs it on every push |

---

## Scaling Design (Task B)
For the target load of 10,000 audits/day and 500 concurrent request bursts under customer-facing SLAs, a comprehensive scale-out system architecture has been drafted. 

You can read the full architecture specification, trade-off analyses, failure mode mitigations, and observability guidelines in:
*   [docs/task-b-scale-architecture.md](file:///c:/Users/rahul/Downloads/page-pulse/docs/task-b-scale-architecture.md)

---

## Running Locally

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Configure environment variables** (optional — defaults are built-in):
    ```bash
    cp .env.example .env
    ```
3.  **Start the server**:
    ```bash
    npm start
    ```

The service will listen on `PORT` (default `3000`). Go to **`http://localhost:3000`** in your browser to access the interactive dashboard.

---

## API Contract

### `POST /api/audit`

**Request body**

```json
{ "url": "https://example.com" }
```

**Success response — `200 OK`**

```json
{
  "url": "https://example.com/",
  "finalUrl": "https://example.com/",
  "statusCode": 200,
  "ok": true,
  "responseTimeMs": 143,
  "contentType": "text/html; charset=UTF-8",
  "contentLengthBytes": 1256,
  "isHttps": true,
  "security": {
    "hasHsts": true,
    "hasContentSecurityPolicy": false,
    "hasXFrameOptions": true
  },
  "page": {
    "title": "Example Domain",
    "metaDescription": "An example page for testing",
    "h1Count": 1,
    "h2Count": 2,
    "imageCount": 4,
    "imagesMissingAlt": 1,
    "hasViewportMeta": true,
    "internalLinkCount": 12,
    "wordCount": 340
  },
  "checkedAt": "2026-07-25T12:00:00.000Z",
  "cache": { "hit": false }
}
```

*Note: `page` is `null` for non-HTML responses (e.g. JSON API endpoints).*

**Error response**

```json
{
  "error": {
    "code": "INVALID_URL",
    "message": "Invalid URL: not a well-formed URL",
    "requestId": "b1e1c1a0-..."
  }
}
```

| HTTP status | `code` | When |
|---|---|---|
| 400 | `MISSING_URL` | No `url` field in the body |
| 400 | `INVALID_URL` | URL doesn't parse, or hostname can't be resolved |
| 400 | `DISALLOWED_PROTOCOL` | Protocol isn't `http`/`https` |
| 400 | `PRIVATE_ADDRESS_BLOCKED` | URL resolves to a private/loopback/link-local address (SSRF guard) |
| 429 | `RATE_LIMITED` | Per-client rate limit exceeded |
| 502 | `UPSTREAM_UNREACHABLE` | Target host refused/reset the connection |
| 503 | `CONCURRENCY_LIMIT_EXCEEDED` | Server's audit queue is full |
| 504 | `AUDIT_TIMEOUT` | Target didn't respond within timeout limit |
| 500 | `INTERNAL_ERROR` | Unexpected internal server error |

### `GET /health`

Returns service status plus cache and concurrency stats:

```json
{ "status": "ok", "cache": { "hits": 4, "misses": 2, "keys": 2 }, "activeAudits": 0, "queuedAudits": 0 }
```

---

## Testing

```bash
npm test
```

The suite uses `undici`'s `MockAgent` to intercept outbound HTTP calls — no real network traffic runs during tests, and failure modes are simulated deterministically.

---

## Notes on AI Use

I used Claude to write most of the initial code for Task A — the API, validation, error handling, caching, and the test suite — and to draft the first version of the Task B scaling document. I reviewed the code myself and understand how it works. When the tests failed, Claude diagnosed and fixed the actual bug (a mocking library that doesn't work with Node's fetch). For Task B, I wasn't happy with the first draft — no real diagram, no stated SLA, no assumptions — so I had Claude rebuild it with those fixed. I read through everything before submitting.

