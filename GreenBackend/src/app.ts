import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { AppError } from './common/errors/app-error.js'
import { errorHandler } from './common/middleware/error-handler.js'
import { notFound } from './common/middleware/not-found.js'
import { originCheck } from './common/middleware/origin-check.js'
import { requestId } from './common/middleware/request-id.js'
import { env } from './config/env.js'
import { apiRouter } from './routes/index.js'

export const app = express()

if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY)
}

app.disable('x-powered-by')
app.use(requestId)
app.use(helmet())
app.use(
  cors({
    credentials: true,
    /**
     * التطبيق الميداني ينادي من أصل الموقع، فكل طلب يحمل ترويسة تفويض
     * يسبقه استطلاع `OPTIONS`. بلا عمر للجواب يعيده المتصفح كل خمس ثوانٍ،
     * وعلى شبكة الميدان ذلك ذهاب وإياب إضافي لكل فعل. المتصفحات تقصّ
     * القيمة إلى سقفها: ساعتان في Chrome.
     */
    maxAge: 7200,
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true)
        return
      }

      callback(
        new AppError('Origin is not allowed by CORS', 403, 'CORS_FORBIDDEN'),
      )
    },
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(cookieParser())
app.use(originCheck)

app.use(env.API_PREFIX, apiRouter)

app.use(notFound)
app.use(errorHandler)
