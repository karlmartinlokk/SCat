# Webhooks

## Overview

In order for GitHub to be able to send activity info to SCat, we need a webhook between them. When an event happens in a repository, GitHub sends it as a POST request to the API endpoint `/webhooks`. To make sure the incoming info is unmodified and only comes from GitHub, every request is signed, and SCat checks the signature before trusting the event (see [Signature verification](#signature-verification)).

## Development setup

For development purposes SCat uses the smee.io client as a relay, which gives a public URL to your device (in production the backend would be deployed with a public HTTPS URL, no relay needed). Running the server and client on your device with `npm run dev` and `npm run smee` opens a connection which GitHub can reach. When an event arrives, smee takes that event and sends it as a normal POST to `/webhooks` on your local server.

The following variables are needed in `backend/.env`. The server refuses to start if any of them is missing:
- `PORT`: the port the server listens on
- `SMEE_URL`: your smee.io channel URL, used by the smee client
- `WEBHOOK_SECRET`: the same secret that is entered in GitHub's webhook settings

## Setting up the webhook in GitHub

In the repository, go to **Settings → Webhooks → Add webhook** and fill in:
- **Payload URL:** the smee channel URL, same string as `SMEE_URL` in `.env`. In production, this is the deployed backend's public URL followed by `/webhooks`.
- **Content type:** `application/json`. The default is `application/x-www-form-urlencoded`, which `express.raw()` doesn't accept, so every delivery would get a `415 Unsupported Media Type`.
- **Secret:** same string as `WEBHOOK_SECRET` in `.env`.
- **Events:** "Just the push event", or pick specific events.
- **Active:** checked.

Once the webhook is saved, GitHub sends a `ping` event, which we can conveniently use to check that everything is connected.

## Signature verification

GitHub uses the HMAC-SHA256 hex encoded algorithm to make the signature hash using the webhook secret and request body, which is sent as header `X-Hub-Signature-256: sha256=<hex>` in the request. Webhook secret is a string known only to GitHub and SCat that lives in GitHub's webhook settings and `.env` respectively.

Checking the signature goes as follows (implemented in `src/controllers/webhooks.ts`):
1. **Server checks that the request body is a raw Buffer** (otherwise `415`)
    - Request body must be read as a raw Buffer, since we need the unaltered original bytes of the request to get the same signature as header after hashing. Parsing regularly in JSON often discards subtle formatting details, hence why hashing or stringifying a JSON-parsed body would not return the original one. For this the webhook route in app.ts has to use `express.raw()` and be registered before the global `express.json()`.
2. **Server checks that the signature header exists** (otherwise `401`)
    - A request without `X-Hub-Signature-256` can't be verified, so it's rejected before doing any hashing.
3. **Server generates a server-side hash with the same format**
    - The hash is made from the raw body and the webhook secret. To match the header format of the sent signature, the hex hash also needs the prefix `sha256=`. More info on how the signature is generated here: [GitHub documentation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
4. **Compares it to the signature received in the request header** (`200` if they match, otherwise `401`)
    - Comparison is done with the Node.js crypto module method `timingSafeEqual()` to mitigate timing attacks that the plain `===` operator would be vulnerable to. The operator `===` compares strings one character at a time and stops at the first mismatch, so a clever attacker could send many guesses and measure response times, effectively being able to work out a valid signature one character at a time, which we do not want. `timingSafeEqual()` compares every byte, so time reveals nothing.
    - Since `timingSafeEqual()` throws if two buffers differ in length, the lengths are compared first, in the same condition joined with `||`. If the lengths differ, the evaluation skips `timingSafeEqual()` entirely. Checking the length with a normal comparison is safe, because the length of a valid signature isn't secret: it's always `sha256=` plus 64 hex characters.

## Responses and troubleshooting

GitHub expects a `2xx` response within 10 seconds, otherwise the delivery is marked as failed. Failed deliveries are not retried automatically, but they can be resent by hand.

| Status | Meaning | Common cause |
|---|---|---|
| `200` | Signature is valid, event accepted | — |
| `401` | Signature header is missing or doesn't match | No secret is set in GitHub's webhook settings (GitHub only sends the signature header when one is set), `WEBHOOK_SECRET` in `.env` differs from the secret in GitHub (watch for stray quotes or spaces), the body was parsed as JSON before hashing, or the `sha256=` prefix is missing from the computed signature |
| `415` | Body isn't raw `application/json` | The webhook's content type in GitHub is left on the default `application/x-www-form-urlencoded`, so `express.raw()` skips the request |

Other problems:
- **No request arrives at all:** smee isn't running, or the webhook's Payload URL doesn't match `SMEE_URL`.
- **Server crashes on startup with "Missing environment variable":** `.env` isn't in `backend/`, or a variable is missing from it.

The webhook's **Recent Deliveries** tab in GitHub shows every request GitHub sent and the response it got back. Check that first when something goes wrong. In the same place there is a **Redeliver** button for resending a previous request, which is useful for testing without actually having to do any git activities.
