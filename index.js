const express = require('express')
const cors = require('cors')
const path = require('path')
const morgan = require('morgan')
const { info } = require('./src/logging')
const { updateSnapshot } = require('./src/utils')

const app = express()
const port = 3000

app.use(morgan('combined'))
app.use(cors())

app.use('/data', express.static(path.join(__dirname, 'data')))

app.use('/', (req, res) => {
  res.send('ok').status(200)
})

const main = async () => {
  updateSnapshot().then(() => {
    info('Running updateSnapshot every hour...')
    setInterval(updateSnapshot, 1000 * 60 * 60)
  })
  app.listen(port, () => {
    info(`Starting app on port ${port}`)
  })
}

main()
