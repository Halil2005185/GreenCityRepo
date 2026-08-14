import { createServer } from 'node:http'

import { app } from './app.js'
import { env } from './config/env.js'
import {
  checkDatabaseConnection,
  closeDatabaseConnection,
} from './db/client.js'

const server = createServer(app)
let isShuttingDown = false

async function start() {
  try {
    const database = await checkDatabaseConnection()
    console.info('[database:connected]', database)
  } catch (error) {
    console.error('[database:startup]', error)

    if (env.DATABASE_REQUIRED_ON_START) {
      throw error
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)

    server.listen(env.PORT, env.HOST, () => {
      server.off('error', onError)
      console.info(
        `[server:ready] http://${env.HOST}:${env.PORT}${env.API_PREFIX}`,
      )
      resolve()
    })
  })
}

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.info(`[server:shutdown] received ${signal}`)

  const forceExitTimer = setTimeout(() => {
    console.error('[server:shutdown] forced after timeout')
    process.exit(1)
  }, 10_000)
  forceExitTimer.unref()

  server.close(async (serverError) => {
    try {
      await closeDatabaseConnection()

      if (serverError) throw serverError
      clearTimeout(forceExitTimer)
      process.exit(0)
    } catch (error) {
      console.error('[server:shutdown]', error)
      process.exit(1)
    }
  })
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

void start().catch(async (error) => {
  console.error('[server:fatal]', error)
  await closeDatabaseConnection().catch(() => undefined)
  process.exit(1)
})
