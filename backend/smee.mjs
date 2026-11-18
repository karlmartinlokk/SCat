import SmeeClient from "smee-client"
import { PORT, SMEE_URL } from './src/utils/config.ts'

const smee = new SmeeClient({
  source: SMEE_URL,
  target: `http://localhost:${PORT}/webhooks`,
  logger: console
});

await smee.start()