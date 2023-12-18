const express = require('express')
const app = express()
const { listCustomers, chargeCustomers } = require('./api')

const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static('public'))

app.post('/api/list-customers', async (req, res) => {
  try {
    await listCustomers(req, res)
  } catch (e) {
    console.error('/api/list-customers', e)

    res.status(500).send(e.message)
  }
})

app.post('/api/charge-customers', async (req, res) => {
  try {
    await chargeCustomers(req, res)
  } catch (e) {
    console.error('/api/charge-customers', e)

    res.status(500).send(e.message)
  }
})

app.post('/api/stop-charge', chargeCustomers)

app.listen(PORT, () => console.log('Listening on port', PORT))