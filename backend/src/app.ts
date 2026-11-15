import express from 'express'
import healthRouter from './controllers/health.js'

const app = express()

app.use('/', healthRouter)

export default app