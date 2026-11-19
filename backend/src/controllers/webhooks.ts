import { Webhooks, createNodeMiddleware } from '@octokit/webhooks'
import { WEBHOOK_SECRET } from '../utils/config.js'

const webhooks = new Webhooks({ secret: WEBHOOK_SECRET })

webhooks.on('push', ({ payload }) => {
    console.log(`push to ${payload.ref}, ${payload.commits.length} commit(s)`)
})

webhooks.on('pull_request.opened', ({ payload }) => {
    console.log(`new PR #${payload.pull_request.number}: ${payload.pull_request.title}`)
})

webhooks.on('pull_request.review_requested', ({ payload }) => {
    console.log(`review requested on PR #${payload.pull_request.number} by ${payload.sender.login}`)
})

webhooks.on('pull_request.closed', ({ payload }) => {
    if (!payload.pull_request.merged) return   // PR closed without merging
    console.log(`PR #${payload.pull_request.number} merged`)
})

webhooks.on('workflow_run.completed', ({ payload }) => {
    if (payload.workflow_run.conclusion !== 'failure') return
    console.log(`CI failed: ${payload.workflow_run.name}`)
})

webhooks.onError((error) => {
    console.error('webhook handler error:', error)
})

export const webhooksMiddleware = createNodeMiddleware(webhooks, { path: '/webhooks' })