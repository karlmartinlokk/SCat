import { Router } from 'express'

const webHookRouter = Router()

//const tempDB = []

/*webHookRouter.get('/', (_req, res) => {
    res.json(tempDB)
})*/

webHookRouter.post('/', (req, res) => {
    //tempDB.push(req.body)
    console.log(req.body)
    res.status(201)
})

export default webHookRouter