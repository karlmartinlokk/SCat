import { Router } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { WEBHOOK_SECRET } from '../utils/config.js'

const webHookRouter = Router()

//const tempDB = []

//webHookRouter.get('/', (_req, _res) => {
    //res.json(tempDB)
//})

webHookRouter.post('/', (req, res) => {
    if (!Buffer.isBuffer(req.body)) return res.sendStatus(415)

    const givenSig = req.headers['x-hub-signature-256']
    if (typeof givenSig !== 'string') return res.sendStatus(401)

    const hmacHex = createHmac('sha256', WEBHOOK_SECRET).update(req.body).digest('hex')
    const expectedSigBuffer = Buffer.from('sha256=' + hmacHex, 'utf-8')
    const givenSigBuffer = Buffer.from(givenSig, 'utf-8')

    if (expectedSigBuffer.length !== givenSigBuffer.length || 
        !timingSafeEqual(expectedSigBuffer, givenSigBuffer)) {
        return res.sendStatus(401)
    }
    //TODO: add logger message of signature success
    return res.sendStatus(200)
})

export default webHookRouter