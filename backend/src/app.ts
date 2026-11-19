import express from 'express'
import healthRouter from './controllers/health.js'
import { webhooksMiddleware } from './controllers/webhooks.js'


const app = express()

app.use(webhooksMiddleware)

app.use(express.json())

app.use('/', healthRouter)

export default app