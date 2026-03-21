import { Router, Request, Response } from 'express'
import { isDbHealthy } from '../models/db'
import { ragService } from '../services/ragService'
import { agentService } from '../services/agentService'

export const healthRouter = Router()

healthRouter.get('/health', async (_req: Request, res: Response) => {
  const [db, rag, agent] = await Promise.allSettled([
    isDbHealthy(),
    ragService.isHealthy(),
    agentService.isHealthy(),
  ])

  const status = {
    service: 'docsense-api',
    timestamp: new Date().toISOString(),
    db: db.status === 'fulfilled' ? db.value : false,
    rag: rag.status === 'fulfilled' ? rag.value : false,
    agent: agent.status === 'fulfilled' ? agent.value : false,
  }

  const allHealthy = status.db && status.rag && status.agent
  res.status(allHealthy ? 200 : 207).json({
    ...status,
    status: allHealthy ? 'ok' : 'degraded',
  })
})

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const dbOk = await isDbHealthy()
  if (dbOk) {
    res.json({ status: 'ready' })
  } else {
    res.status(503).json({ status: 'not ready', reason: 'database unavailable' })
  }
})
