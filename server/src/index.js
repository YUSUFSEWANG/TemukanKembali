import { createApp } from './app.js'
import { createDatabase } from './database.js'

const db = createDatabase()
const app = createApp(db)
const port = Number(process.env.PORT ?? 3000)

app.listen(port, () => console.log(`TemuBalik API berjalan di http://localhost:${port}`))