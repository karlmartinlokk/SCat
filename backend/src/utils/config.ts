import 'dotenv/config'

const narrowEnvType = (key: string ) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

const PORT = Number(narrowEnvType('PORT'))
if (Number.isNaN(PORT)) throw new Error(`Invalid PORT ${(narrowEnvType('PORT'))}`)

const SMEE_URL = narrowEnvType('SMEE_URL')
const WEBHOOK_SECRET = narrowEnvType('WEBHOOK_SECRET')

export { PORT, SMEE_URL, WEBHOOK_SECRET }

