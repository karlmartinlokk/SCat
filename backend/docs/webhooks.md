# Webhooks

## Overview

In order for GitHub to be able to send activity info to SCat, we need a webhook between them. When an event happens in a repository, GitHub sends it as a POST request to the API endpoint `/webhooks`. To make sure the incoming info is unmodified and only comes from GitHub, every request is signed, and SCat checks the signature before trusting the event (see [Signature verification](#signature-verification)).

Receiving, verifying and dispatching webhooks is handled by the [`@octokit/webhooks`](https://github.com/octokit/webhooks.js) library. Its middleware is set up in `src/controllers/webhooks.ts` and mounted in `src/app.ts`.

## Implementation history

In the beginning I wrote the webhook plumbing myself: an Express route that read the body as a raw Buffer, computed the HMAC-SHA256 signature with Node's `crypto` module, compared it to the request header with `timingSafeEqual()`, and then had to narrow the event header and parse the JSON body by hand (see commit `1710fe9`).

It worked, but every new event the cat should react to would have needed its own payload validation (for example a zod schema), plus another section in a growing `switch` over event names and actions. So I switched to `@octokit/webhooks` for its simplicity, ease of use, and functionality:
- Signature verification is built in and works the same way as my original implementation (raw body, HMAC-SHA256, length check + `timingSafeEqual()`).
- Handlers are registered per event and action, for example `pull_request.closed`, so no hand-written dispatching is needed.
- Every payload is fully typed from GitHub's official OpenAPI spec, so fields autocomplete and mistakes are caught at compile time instead of at runtime.
- Adding a new reaction is a single `webhooks.on(...)` call.

Writing it from scratch first was still worthwhile, since it's the reason the [Signature verification](#signature-verification) section below can explain what the library does under the hood.

## Development setup

For development purposes SCat uses the smee.io client as a relay, which gives a public URL to your device (in production the backend would be deployed with a public HTTPS URL, no relay needed). Running the server and client on your device with `npm run dev` and `npm run smee` opens a connection which GitHub can reach. When an event arrives, smee takes that event and sends it as a normal POST to `/webhooks` on your local server.

The following variables are needed in `backend/.env`. The server refuses to start if any of them is missing:
- `PORT`: the port the server listens on
- `SMEE_URL`: your smee.io channel URL, used by the smee client
- `WEBHOOK_SECRET`: the same secret that is entered in GitHub's webhook settings

## Setting up the webhook in GitHub

In the repository, go to **Settings → Webhooks → Add webhook** and fill in:
- **Payload URL:** the smee channel URL, same string as `SMEE_URL` in `.env`. In production, this is the deployed backend's public URL followed by `/webhooks`.
- **Content type:** `application/json`. The default is `application/x-www-form-urlencoded`, which the middleware rejects, so every delivery would get a `415 Unsupported Media Type`.
- **Secret:** same string as `WEBHOOK_SECRET` in `.env`. Required: the middleware rejects any delivery without a signature.
- **Events:** "Let me select individual events", and tick the ones in [Handled events](#handled-events).
- **Active:** checked.

Once the webhook is saved, GitHub sends a `ping` event, which we can conveniently use to check that everything is connected.

## Handling events

GitHub groups activity into events (sent in the `X-GitHub-Event` header), and most events have an `action` field in the body. Octokit lets handlers subscribe to either `event` or `event.action`.

| Reaction | Handler | Extra condition |
|---|---|---|
| Push | `push` | — |
| New PR | `pull_request.opened` | — |
| Review requested | `pull_request.review_requested` | — |
| PR merged | `pull_request.closed` | `pull_request.merged` is `true` (otherwise the PR was closed without merging) |
| CI failed | `workflow_run.completed` | `workflow_run.conclusion` is `"failure"` |

There is no separate "merge" event in GitHub. A merge is a pull request being closed with `merged: true`. Events without a registered handler (such as `ping`) are still verified and answered with `200`.

## Middleware mounting

`createNodeMiddleware()` returns a middleware that handles everything for the path it's given (`/webhooks`) and passes all other requests on to the next middleware. That's why `app.ts` doesn't need a separate webhook router. The middleware reads the raw request body itself (see below), which is why it need to come before `express.json()`. If a body parser reads the request stream first, there's nothing left for the middleware to read.

## Signature verification

GitHub uses the HMAC-SHA256 hex encoded algorithm to make the signature hash using the webhook secret and request body, which is sent as header `X-Hub-Signature-256: sha256=<hex>` in the request. Webhook secret is a string known only to GitHub and SCat that lives in GitHub's webhook settings and `.env` respectively.

The signature verification is done as follows. The middleware does this for you for every request to `/webhooks`, before any handler runs:
1. **Checks that the request is a POST with content type `application/json`** (otherwise `404` or `415`)
2. **Checks that the required headers exist:** `X-GitHub-Event`, `X-Hub-Signature-256` and `X-GitHub-Delivery` (otherwise `400`)
    - A request without a signature can't be verified, so it's rejected before doing any hashing.
3. **Reads the body as raw bytes**
    - The body must be the unaltered original bytes of the request to get the same signature as the header after hashing. Parsing it as JSON often discards subtle formatting details, which is why hashing a re-stringified JSON body would not match. This is also why no body parser may run before the middleware.
4. **Generates a server-side hash in the same format**
    - The hash is made from the raw body and the webhook secret, prefixed with `sha256=` to match the header format. More info on how the signature is generated here: [GitHub documentation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
5. **Compares it to the signature received in the request header** (otherwise `400`)
    - The comparison uses the Node.js crypto method `timingSafeEqual()` to mitigate timing attacks that the plain `===` operator would be vulnerable to. The operator `===` compares strings one character at a time and stops at the first mismatch, so a clever attacker could send many guesses and measure response times, effectively being able to work out a valid signature one character at a time, which we do not want. `timingSafeEqual()` compares every byte, so time reveals nothing.
    - Since `timingSafeEqual()` throws if two buffers differ in length, the lengths are compared first. Checking the length with a normal comparison is safe, because the length of a valid signature isn't secret: it's always `sha256=` plus 64 hex characters.
6. **Parses the JSON and runs the matching handlers** (`200` when they finish)

## Responses and troubleshooting

GitHub expects a `2xx` response within 10 seconds, otherwise the delivery is marked as failed. Failed deliveries are not retried automatically, but they can be resent by hand.

| Status | Meaning | Common cause |
|---|---|---|
| `200` | Signature is valid, handlers ran | — |
| `202` | Handlers are still running after ~9 seconds, so the middleware answers early to beat GitHub's timeout | A slow handler, or a body parser running before the middleware (see below) |
| `400` | Required header missing, or signature doesn't match | No secret is set in GitHub's webhook settings (GitHub only sends the signature header when one is set), or `WEBHOOK_SECRET` in `.env` differs from the secret in GitHub (watch for stray quotes or spaces) |
| `404` | Request to `/webhooks` wasn't a POST | Opening the URL in a browser, for example |
| `415` | Content type isn't `application/json` | The webhook's content type in GitHub is left on the default `application/x-www-form-urlencoded` |
| `500` | A handler threw an error | A bug in one of the `webhooks.on(...)` handlers. The error is logged by `webhooks.onError()` |

Other problems:
- **No request arrives at all:** smee isn't running, the webhook's Payload URL doesn't match `SMEE_URL`, or the smee target path doesn't match the middleware's `path`.
- **Server crashes on startup with "Missing environment variable":** `.env` isn't in `backend/`, or a variable is missing from it.

The webhook's **Recent Deliveries** tab in GitHub shows every request GitHub sent and the response it got back. Check that first when something goes wrong. In the same place there is a **Redeliver** button for resending a previous request, which is useful for testing without actually having to do any git activities.
