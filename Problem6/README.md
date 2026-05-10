# Live Scoreboard API Module Specification

## 1. Overview

This document specifies a backend API module for maintaining and broadcasting a live top-10 user scoreboard.

The module receives score update requests after users complete authorized actions, validates that the score increase is legitimate, persists the new score, recalculates the top 10 leaderboard, and pushes live updates to connected clients.

The implementation target is the API service / backend application server.

## 2. Goals

- Show the top 10 users by score on the website scoreboard.
- Update the scoreboard live when scores change.
- Allow score increases only after a valid authorized action completion.
- Prevent malicious users from directly increasing their own scores.
- Provide a clear backend contract for API, persistence, validation, and realtime delivery.

## 3. Non-Goals

- Defining the business logic of the user action itself.
- Implementing the frontend scoreboard UI.
- Supporting manual score edits from users.
- Supporting negative scores or score transfers between users.

## 4. Actors

- **User**: Authenticated website user who performs an action.
- **Client Application**: Website frontend that calls the API after action completion and subscribes to live scoreboard updates.
- **API Service**: Backend application server that validates requests, updates scores, and publishes leaderboard changes.
- **Action Authority**: Trusted backend component or service that can prove an action was completed. This may be the same API service if action completion is handled internally.
- **Realtime Gateway**: Server-Sent Events layer used to broadcast scoreboard changes to all connected clients.
- **Database / Cache**: Persistent storage and optional ranking cache used by the API service.

## 5. Core Requirements

### 5.1 Scoreboard

- The scoreboard must return the top 10 users sorted by score descending.
- Ties should be ordered deterministically, for example:
  1. Higher score first.
  2. Earlier time reaching that score first.
  3. Lower user ID or stable unique ID as final tie-breaker.
- The scoreboard response should include enough information for display:
  - Rank
  - User ID
  - Display name
  - Score
  - Last score update timestamp

### 5.2 Live Updates

- Clients must be able to subscribe to scoreboard updates.
- When a committed score update changes the top 10 leaderboard, the API service must publish the new top 10 snapshot.
- The broadcast payload should be a complete top 10 snapshot, not only a delta, so clients can recover from missed events.
- Events should include a monotonically increasing version or timestamp to let clients ignore stale updates.

### 5.3 Score Updates

- Score changes must happen only through a backend-validated score update endpoint or internal command.
- The client must not be trusted to submit arbitrary score increments.
- Each score update must be tied to a completed action proof, such as:
  - A server-issued action completion ID.
  - A signed one-time completion token.
  - A backend-to-backend event from a trusted action service.
- Each action completion may be used only once for scoring.

### 5.4 Security

- The score update endpoint must require authentication.
- The authenticated user must match the user bound to the action completion proof.
- The API service must validate that:
  - The action completion proof is authentic.
  - The proof has not expired.
  - The proof has not already been consumed.
  - The score increment matches the action type or server-side rule.
- The system must apply rate limits and abuse detection to score update requests.
- Failed authorization attempts should be logged with enough context for investigation.

## 6. Proposed API Contract

### 6.1 Get Current Scoreboard

```http
GET /api/scoreboard/top
Authorization: Bearer <access_token>
```

#### Response

```json
{
  "version": 1842,
  "generatedAt": "2026-05-10T10:15:30.000Z",
  "entries": [
    {
      "rank": 1,
      "userId": "user_123",
      "displayName": "Alex",
      "score": 9800,
      "lastUpdatedAt": "2026-05-10T10:14:51.000Z"
    }
  ]
}
```

### 6.2 Submit Completed Action for Score Update

```http
POST /api/scores/actions/complete
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <uuid>
```

#### Request

```json
{
  "actionCompletionId": "actcmp_789",
  "completionToken": "signed-one-time-token"
}
```

#### Response

```json
{
  "userId": "user_123",
  "score": 9850,
  "increment": 50,
  "scoreUpdatedAt": "2026-05-10T10:16:00.000Z",
  "scoreboardVersion": 1843,
  "top10Changed": true
}
```

#### Error Responses

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_REQUEST` | Missing or malformed request fields. |
| `401` | `UNAUTHENTICATED` | Missing or invalid access token. |
| `403` | `ACTION_NOT_AUTHORIZED` | Action proof does not belong to authenticated user. |
| `409` | `ACTION_ALREADY_CONSUMED` | Action completion was already used for scoring. |
| `422` | `ACTION_NOT_SCOREABLE` | Action exists but is not eligible for score increase. |
| `429` | `RATE_LIMITED` | Too many requests or suspicious retry pattern. |

### 6.3 Live Scoreboard Subscription Using Server-Sent Events

The module must use Server-Sent Events (SSE) to push score updates to all connected website clients.

```http
GET /api/scoreboard/stream
Authorization: Bearer <access_token>
Accept: text/event-stream
```

#### Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

`X-Accel-Buffering: no` is recommended when the API service is behind Nginx so events are flushed immediately.

#### Event Format

Each leaderboard update must be sent as a named SSE event:

```text
id: 1843
event: scoreboard.updated
data: {"version":1843,"generatedAt":"2026-05-10T10:16:00.000Z","entries":[{"rank":1,"userId":"user_123","displayName":"Alex","score":9850,"lastUpdatedAt":"2026-05-10T10:16:00.000Z"}]}

```

The `id` field must match the scoreboard `version`. Clients should send the latest received event ID using the standard `Last-Event-ID` header when reconnecting.

#### Event Payload Data

```json
{
  "version": 1843,
  "generatedAt": "2026-05-10T10:16:00.000Z",
  "entries": [
    {
      "rank": 1,
      "userId": "user_123",
      "displayName": "Alex",
      "score": 9850,
      "lastUpdatedAt": "2026-05-10T10:16:00.000Z"
    }
  ]
}
```

#### Heartbeat Event

The server should send a heartbeat comment every 15-30 seconds to keep intermediaries and browsers from closing idle connections:

```text
: heartbeat

```

## 7. Data Model

### 7.1 `users`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string / uuid | Primary key. |
| `display_name` | string | Public scoreboard name. |
| `created_at` | timestamp | User creation time. |

### 7.2 `user_scores`

| Field | Type | Notes |
| --- | --- | --- |
| `user_id` | string / uuid | Primary key and foreign key to `users.id`. |
| `score` | bigint | Current total score. |
| `last_updated_at` | timestamp | Last successful score change. |
| `score_version` | bigint | Incremented on each score change. |

### 7.3 `action_completions`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string / uuid | Primary key. |
| `user_id` | string / uuid | User who completed the action. |
| `action_type` | string | Used to determine score increment. |
| `score_increment` | integer | Server-issued increment. |
| `status` | enum | `pending`, `completed`, `consumed`, `expired`, `rejected`. |
| `completed_at` | timestamp | When action was completed. |
| `consumed_at` | timestamp nullable | When score was awarded. |
| `expires_at` | timestamp | Expiration for score claim. |
| `proof_hash` | string nullable | Hash of signed completion token or proof. |

### 7.4 `score_transactions`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string / uuid | Primary key. |
| `user_id` | string / uuid | User receiving score. |
| `action_completion_id` | string / uuid | Unique reference to prevent replay. |
| `increment` | integer | Awarded score amount. |
| `score_before` | bigint | Previous score. |
| `score_after` | bigint | New score. |
| `created_at` | timestamp | Transaction time. |
| `idempotency_key` | string | Unique per user/request where applicable. |

### 7.5 `scoreboard_versions`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | bigint | Monotonically increasing version. |
| `generated_at` | timestamp | Version creation time. |

## 8. Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant Client as Website Client
    participant API as API Service
    participant Auth as Auth Middleware
    participant Action as Action Authority
    participant DB as Database
    participant Cache as Ranking Cache
    participant RT as SSE Gateway
    participant Viewers as Connected Scoreboard Clients

    User->>Client: Completes scoreable action
    Client->>API: POST /api/scores/actions/complete
    API->>Auth: Validate access token
    Auth-->>API: Authenticated user ID
    API->>Action: Validate action completion proof
    Action-->>API: Valid proof, user binding, increment
    API->>DB: Begin transaction
    API->>DB: Lock action_completion row
    API->>DB: Verify completion is unused and unexpired
    API->>DB: Mark completion as consumed
    API->>DB: Increment user score
    API->>DB: Insert score transaction
    API->>DB: Commit transaction
    API->>Cache: Recalculate or update top 10
    Cache-->>API: Top 10 snapshot and version
    alt Top 10 changed
        API->>RT: Publish scoreboard.updated SSE event
        RT-->>Viewers: Broadcast top 10 snapshot to all SSE clients
    else Top 10 unchanged
        API-->>Client: Return updated user score
    end
    API-->>Client: Return score update result
```

## 9. Backend Processing Rules

### 9.1 Request Validation

1. Validate JSON schema and required fields.
2. Validate authentication token.
3. Resolve authenticated `user_id`.
4. Validate `Idempotency-Key` format when supplied.
5. Reject requests with unsupported action proof format.

### 9.2 Authorization and Anti-Replay

1. Fetch the action completion record or verify the signed token.
2. Confirm the action belongs to the authenticated user.
3. Confirm the action is complete and scoreable.
4. Confirm the action has not expired.
5. Lock the action completion record inside a transaction.
6. Confirm the action has not already been consumed.
7. Mark the action as consumed before or atomically with the score update.

### 9.3 Score Update Transaction

The score update must be atomic:

1. Lock the score row for the user.
2. Store `score_before`.
3. Add the server-determined increment.
4. Store `score_after`.
5. Insert a `score_transactions` record.
6. Commit all changes together.

If any step fails, the transaction must roll back and no score should be awarded.

### 9.4 Leaderboard Calculation

The module may use one of two approaches:

- **Database-first**: Query the top 10 from `user_scores` after each committed update. This is simpler and acceptable for moderate traffic with proper indexes.
- **Cache-first**: Maintain a sorted set in Redis or equivalent and query the top 10 from the cache. This is preferred for high traffic and frequent live updates.

Recommended database index:

```sql
CREATE INDEX idx_user_scores_score_rank
ON user_scores (score DESC, last_updated_at ASC, user_id ASC);
```

If Redis is used, the database remains the source of truth. The cache must be rebuildable from persisted scores.

## 10. Realtime Delivery with Server-Sent Events

### 10.1 Event Publishing

- Publish only after the database transaction commits.
- Publish a full scoreboard snapshot with `version`.
- Do not publish uncommitted or speculative score changes.
- Use an outbox table if the service needs stronger reliability between database commits and realtime publishing.
- Broadcast the same `scoreboard.updated` event to every currently connected SSE client.
- Flush the HTTP response after each event so clients receive updates immediately.

### 10.2 Client Recovery

- Clients should call `GET /api/scoreboard/top` on initial load.
- Clients should subscribe to `/api/scoreboard/stream` after initial load.
- If a client receives an event with a version lower than or equal to the latest version it has rendered, it should ignore the event.
- If the stream disconnects, the browser `EventSource` client should reconnect automatically.
- On reconnect, the client should provide `Last-Event-ID` automatically when available.
- If the server cannot replay missed events, the client should fetch `GET /api/scoreboard/top` after reconnect and then continue listening.

### 10.3 SSE Connection Management

- Keep one long-lived HTTP connection per connected client.
- Authenticate the connection before opening the stream.
- Remove disconnected clients from the in-memory subscriber list immediately when the request closes.
- Send heartbeat comments every 15-30 seconds.
- Set proxy and load balancer timeouts high enough for long-lived streaming requests.
- Disable proxy buffering for the SSE endpoint.
- If the API service runs multiple instances, use Redis Pub/Sub, a message broker, or a shared event bus so each instance can broadcast updates to its own connected clients.

### 10.4 SSE Limitations

- SSE is one-way from server to client. This is acceptable for scoreboard updates because clients only need to receive updates after submitting score changes through normal HTTP APIs.
- Browsers limit concurrent HTTP connections per origin, especially on HTTP/1.1. Prefer HTTP/2 in production.
- If private per-user realtime commands are needed later, WebSocket may be considered separately, but it is not required for this scoreboard module.

## 11. Security Controls

### 11.0 OWASP Security Risk Review

The implementation must be reviewed against OWASP API Security Top 10 risks before release.

| OWASP API Security Risk | Required Mitigation |
| --- | --- |
| API1: Broken Object Level Authorization | Do not allow the client to choose `userId`, score value, or score increment. Derive the user from the access token and the increment from server-side action rules. |
| API2: Broken Authentication | Require valid access tokens on score update and SSE endpoints. Use short-lived tokens and validate signature, issuer, audience, and expiry. |
| API3: Broken Object Property Level Authorization | Return only public scoreboard fields. Do not expose email, phone, roles, internal fraud flags, or token data. |
| API4: Unrestricted Resource Consumption | Apply rate limits, request body limits, SSE connection limits, heartbeat timeouts, and per-instance max subscriber limits. |
| API5: Broken Function Level Authorization | Only authenticated users may submit score claims. Admin score adjustment APIs, if added later, must be separate and role-protected. |
| API6: Unrestricted Access to Sensitive Business Flows | Protect the score update flow with one-time action completion proof, anti-replay checks, frequency limits, and anomaly detection. |
| API7: Server-Side Request Forgery | If action proof validation calls another service, use an allowlist of internal service URLs. Never call arbitrary URLs from request payloads. |
| API8: Security Misconfiguration | Disable debug errors in production, enforce HTTPS, secure CORS, disable proxy buffering for SSE only, and use secure headers. |
| API9: Improper Inventory Management | Version the API, document the endpoints, and ensure deprecated score endpoints are removed or blocked. |
| API10: Unsafe Consumption of APIs | Validate responses from trusted action services, use timeouts, retries with backoff, and authenticated service-to-service calls. |

Release must be blocked if any critical or high-risk issue remains unresolved.

### 11.1 Required Controls

- Use short-lived access tokens for user authentication.
- Bind every action completion proof to a specific user ID.
- Make action completion proofs one-time use.
- Store consumed action completions to prevent replay.
- Never accept score increments directly from the client.
- Use server-side action-to-score rules.
- Enforce rate limits per user ID, IP address, and device/session where available.
- Log repeated failed attempts and suspicious replay attempts.

### 11.2 Rate Limiting Policy

Rate limiting is required for both score update and SSE endpoints.

Recommended initial limits:

| Endpoint | Limit | Key |
| --- | --- | --- |
| `POST /api/scores/actions/complete` | 10 requests per minute | Authenticated user ID |
| `POST /api/scores/actions/complete` | 30 requests per minute | IP address |
| `POST /api/scores/actions/complete` invalid proof failures | 5 failures per 10 minutes | User ID + IP address |
| `GET /api/scoreboard/top` | 120 requests per minute | User ID or IP address |
| `GET /api/scoreboard/stream` | 3 concurrent SSE connections | User ID |
| `GET /api/scoreboard/stream` | 20 concurrent SSE connections | IP address |

Rate limit responses must use:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

Rate limiter implementation requirements:

- Use a distributed store such as Redis if the API service runs multiple instances.
- Rate limit before expensive action proof validation.
- Use stricter limits for invalid completion proofs and replay attempts.
- Emit rate limit metrics and logs.
- Do not count successful SSE heartbeat messages as new requests.

### 11.3 Completion Token Recommendation

If using signed completion tokens, include these claims:

```json
{
  "tokenType": "score_action_completion",
  "actionCompletionId": "actcmp_789",
  "userId": "user_123",
  "actionType": "daily_challenge",
  "scoreIncrement": 50,
  "issuedAt": 1778408100,
  "expiresAt": 1778408400,
  "nonce": "random-unique-value"
}
```

The API service must verify the signature and still check server-side storage to ensure the token has not been consumed.

### 11.4 Abuse Detection

Recommended signals:

- Many invalid completion tokens from one user or IP.
- Repeated attempts to reuse consumed action IDs.
- Score updates at impossible frequency.
- Large score movement inconsistent with action rules.
- Multiple accounts from the same device or network showing coordinated behavior.

## 12. Idempotency

Idempotency must be implemented for the score update endpoint to protect against client retries, network timeouts, and duplicate submissions.

### 12.1 Idempotency Rules

- `Idempotency-Key` is required for `POST /api/scores/actions/complete`.
- The idempotency key must be unique per authenticated user and request intent.
- The server must store the idempotency key, request hash, response body, response status, and expiration time.
- Repeating the same request with the same idempotency key must return the original response.
- Reusing the same idempotency key with a different request body must return `409 IDEMPOTENCY_KEY_REUSED`.
- Idempotency records should expire after 24 hours unless product requirements need a longer retry window.

### 12.2 Replay vs Idempotency

Idempotency and anti-replay solve different problems:

- Idempotency allows a legitimate client to retry the same request safely.
- Anti-replay prevents the same action completion from awarding score more than once.

Both checks are required. Even without an `Idempotency-Key`, the unique `action_completion_id` constraint must prevent duplicate score awards.

### 12.3 Required Constraints

Recommended database constraints:

```sql
CREATE UNIQUE INDEX uniq_score_transactions_action_completion
ON score_transactions (action_completion_id);

CREATE UNIQUE INDEX uniq_idempotency_user_key
ON idempotency_keys (user_id, idempotency_key);
```

## 13. Reliability and Consistency

- Score updates must be strongly consistent for each user.
- Duplicate requests with the same action completion should not award duplicate points.
- Duplicate requests with the same `Idempotency-Key` should return the original result when possible.
- Realtime delivery may be eventually consistent, but clients must be able to recover with the snapshot endpoint.
- Leaderboard cache failures should not corrupt scores. If cache update fails, the service should retry or rebuild from the database.

## 14. Cloud Deployment and Scalability

### 14.1 Cloud Architecture

Recommended production topology:

```text
Client Browser
    |
CDN / WAF
    |
Load Balancer
    |
API Service Instances
    |             |
Database      Redis / Message Broker
    |             |
Monitoring / Logging / Alerting
```

### 14.2 Horizontal Scaling

- API service instances must be stateless for normal HTTP requests.
- SSE connections are long-lived, so each instance must maintain only its own connected clients.
- When a score update happens on one instance, publish the leaderboard event to Redis Pub/Sub, Kafka, NATS, or a cloud event bus.
- Every API instance subscribes to that shared event channel and broadcasts the event to its local SSE clients.
- Use a distributed rate limiter so limits are enforced consistently across instances.
- Use managed database read replicas only for read-heavy scoreboard snapshots if consistency requirements allow it. Score writes must go to the primary database.

### 14.3 Load Balancer and Proxy Requirements

- Support long-lived HTTP connections for `/api/scoreboard/stream`.
- Disable response buffering for the SSE endpoint.
- Configure idle timeout higher than the heartbeat interval.
- Prefer HTTP/2 to reduce browser connection pressure.
- Enable TLS termination at the load balancer or edge.
- Use health checks that do not depend on the SSE endpoint.

### 14.4 Deployment Safety

- Use rolling deployments so existing SSE clients reconnect gradually.
- On shutdown, stop accepting new SSE clients, close existing streams gracefully, and let clients reconnect.
- Keep database migrations backward-compatible across at least one deployment version.
- Store secrets in a cloud secret manager, not environment files committed to source control.
- Use infrastructure metrics for CPU, memory, open connections, Redis latency, database locks, and publish latency.

### 14.5 Capacity Planning

Before launch, define expected values for:

- Peak concurrent SSE clients.
- Peak score update requests per second.
- Average and p95 leaderboard publish latency.
- Database write throughput.
- Redis or message broker fan-out throughput.
- Maximum acceptable reconnect rate during deploys.

## 15. Observability

### 15.1 Logs

Log the following:

- Score update success with user ID, action completion ID, increment, and transaction ID.
- Authorization failures.
- Replay attempts.
- Rate limit rejections.
- Realtime publish failures.

Do not log raw access tokens or raw completion tokens.

### 15.2 Metrics

Recommended metrics:

- `score_update_requests_total`
- `score_update_success_total`
- `score_update_failure_total`
- `score_update_replay_rejected_total`
- `scoreboard_top10_changed_total`
- `scoreboard_publish_latency_ms`
- `scoreboard_sse_connected_clients`
- `scoreboard_sse_reconnect_total`
- `scoreboard_sse_publish_failure_total`
- `scoreboard_cache_rebuild_total`
- `idempotency_key_reuse_total`
- `rate_limit_rejected_total`
- `action_completion_replay_rejected_total`

### 15.3 Alerts

Recommended alerts:

- Sudden increase in replay attempts.
- Score update failure rate above threshold.
- Realtime publish failures.
- Cache rebuild failures.
- Unusually high score growth for one user or cohort.
- SSE connected clients near instance capacity.
- Redis/message broker publish latency above threshold.

## 16. Suggested Implementation Architecture

```text
api-service
├── controllers
│   ├── scoreboard-controller
│   └── score-action-controller
├── services
│   ├── score-service
│   ├── action-proof-service
│   ├── leaderboard-service
│   └── realtime-scoreboard-publisher
├── repositories
│   ├── user-score-repository
│   ├── action-completion-repository
│   └── score-transaction-repository
└── middleware
    ├── authentication
    ├── rate-limit
    └── request-id
```

### 16.1 Module Responsibilities

- `score-action-controller`: Handles HTTP request/response for score updates.
- `score-service`: Owns the atomic score update transaction.
- `action-proof-service`: Validates action completion proof and user binding.
- `leaderboard-service`: Calculates and versions the top 10 scoreboard.
- `realtime-scoreboard-publisher`: Publishes committed leaderboard snapshots.
- `scoreboard-controller`: Serves the current top 10 snapshot and stream endpoint.

## 17. Testing Requirements

### 17.1 Unit Tests

- Valid score update increases score once.
- Reusing the same action completion is rejected.
- Completion proof for another user is rejected.
- Expired completion proof is rejected.
- Client-provided score increment is ignored or rejected.
- Tie-breaking produces deterministic rank order.
- Same `Idempotency-Key` and same request returns the original response.
- Same `Idempotency-Key` with different request body returns `409`.
- Rate limiter allows requests under threshold and rejects requests above threshold.
- SSE event formatter produces valid `id`, `event`, and `data` fields.

### 17.2 Integration Tests

- Database transaction rolls back on failure.
- Concurrent requests for the same action completion award points only once.
- Top 10 recalculates correctly after score changes.
- Realtime event is published only after commit.
- Snapshot endpoint returns the same version as the latest broadcast.
- Distributed rate limiter works across multiple API instances.
- Redis Pub/Sub or message broker broadcasts a score update to SSE clients connected to different API instances.
- Idempotency records are persisted and reused across retries.
- Database unique constraints prevent duplicate `action_completion_id` transactions.

### 17.3 End-to-End Tests

- A user completes an action, submits the completion proof, receives an updated score, and all connected scoreboard clients receive the SSE update.
- Two browser clients connected as different users both receive the same top 10 snapshot after a score change.
- A disconnected SSE client reconnects and recovers the latest scoreboard snapshot.
- A client retry after timeout with the same `Idempotency-Key` does not duplicate score.
- A malicious client attempting to submit another user's action proof is rejected.

### 17.4 Security Tests

- Missing auth token returns `401`.
- Tampered completion token returns `403`.
- Replay attack returns `409`.
- High-frequency invalid requests trigger rate limit.
- Logs do not contain raw secrets.
- OWASP API Security Top 10 checklist has no unresolved critical or high-risk findings.

### 17.5 Performance Tests

Performance tests are required before production release.

Minimum scenarios:

- `GET /api/scoreboard/top` under normal and peak read traffic.
- `POST /api/scores/actions/complete` under normal and peak write traffic.
- Concurrent score updates for different users.
- Concurrent duplicate score updates for the same action completion.
- SSE fan-out to expected peak connected clients.
- SSE reconnect storm after rolling deploy or temporary network interruption.
- Redis/message broker latency under publish bursts.

Recommended initial targets, to be confirmed by product traffic estimates:

| Scenario | Target |
| --- | --- |
| Score update p95 latency | Less than 300 ms excluding external action service latency |
| Scoreboard snapshot p95 latency | Less than 100 ms when served from cache |
| SSE publish p95 latency | Less than 500 ms from database commit to client receive |
| Duplicate action submissions | 0 duplicate score awards |
| SSE reconnect success | 99% reconnect within 10 seconds |

## 18. Open Questions for Engineering

- Is the action completion generated by the same API service or by another trusted backend service?
- What SSE fan-out mechanism should be used when the API service runs multiple instances: Redis Pub/Sub, message broker, or platform-managed event bus?
- What is the expected peak rate of score updates per second?
- Should anonymous users be allowed to view the scoreboard?
- Are display names immutable for leaderboard snapshots, or should historical names be updated when users rename themselves?
- What score increments apply to each action type?
- What are the expected peak concurrent SSE clients and target cloud region count?
- What WAF and API gateway are available in the deployment platform?

## 19. Additional Improvement Comments

- Prefer a backend-to-backend action completion event over a client-submitted completion token when possible. It reduces the attack surface because the browser never handles score-granting proof.
- Use an outbox pattern if losing a realtime event after a successful database commit is unacceptable. The snapshot endpoint already provides recovery, but outbox processing improves delivery reliability.
- Keep an append-only `score_transactions` table even if only current scores are displayed. It is essential for audits, fraud investigation, and score repair.
- Consider a moderation/admin workflow to freeze or adjust suspicious accounts, but keep that separate from the user-facing score update API.
- Avoid broadcasting personal or sensitive user data in scoreboard events. Only include fields required by the public scoreboard UI.
- Add a background reconciliation job that periodically rebuilds the leaderboard cache from the database and compares versions or top 10 output.
- Define score limits per action type and per time window. Authorization alone prevents simple forgery, but rate and frequency rules help detect compromised accounts.
