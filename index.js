const express = require('express')
const path = require('path')
const morgan = require('morgan')
const { updateSnapshot } = require('./src/utils')

const app = express()
const port = 3000

app.use(morgan('combined'))
app.use('/data', express.static(path.join(__dirname, 'data')))

const updateSnapshotHourly = async () => {
  await updateSnapshot()
  setTimeout(updateSnapshot, 3600000)
}

const main = async () => {
  setTimeout(updateSnapshotHourly, 3600000)
  app.listen(port, () => {
    console.log(`Starting app on port ${port}`)
  })
}

main()
