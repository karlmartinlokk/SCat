import express from 'express'
import healthRouter from './controllers/health.js'
import webhookRouter from './controllers/webhooks.js'


const app = express()

app.use('/webhooks', express.raw({ type:'application/json' }), webhookRouter)

app.use(express.json())
app.use('/', healthRouter)

export default app