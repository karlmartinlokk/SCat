const healthRouter = require('express').Router()

healthRouter.get('/', (request, response) => {
    response.json('ok')
})

module.exports = healthRouter