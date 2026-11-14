const express = require('express')
const healthRouter = require('./controllers/health')

const app = express()

app.use('/', healthRouter)

module.exports = app