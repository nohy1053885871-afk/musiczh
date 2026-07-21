import 'dotenv/config'
import db from '../db.js'
import { getRollupState, setRollupStatus } from '../lib/overview/rollupWriter.js'

const requested = process.argv[2]
if (requested !== 'building' && requested !== 'ready' && requested !== 'disabled') {
  console.error('usage: npm run overview:status -- building|ready|disabled')
  process.exitCode = 1
} else {
  setRollupStatus(db, requested)
  console.log(getRollupState(db))
}
