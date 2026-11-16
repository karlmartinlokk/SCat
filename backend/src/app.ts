import express from 'express'
import healthRouter from './controllers/health.js'
import webhookRouter from './controllers/webhooks.js'

const app = express()

app.use(express.json())
app.use('/', healthRouter)
app.use('/webhooks', webhookRouter)

export default app