import type { RequestHandler } from 'express'

import { checkDatabaseConnection } from '../../db/client.js'

export const getHealth: RequestHandler = (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'green-cities-api',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
}

export const getReadiness: RequestHandler = async (_request, response) => {
  try {
    const database = await checkDatabaseConnection()

    response.status(200).json({
      status: 'ready',
      database,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[health:database]', error)

    response.status(503).json({
      status: 'unavailable',
      database: { status: 'disconnected' },
      timestamp: new Date().toISOString(),
    })
  }
}
