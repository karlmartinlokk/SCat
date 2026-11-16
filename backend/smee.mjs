import SmeeClient from "smee-client"
import 'dotenv/config'

const smee = new SmeeClient({
  source: process.env.SMEE_URL,
  target: 'http://localhost:3003/webhooks',
  logger: console
});

await smee.start()