const express = require('express')
const app = express()
const cors = require('cors')
const path = require('path')
const compression = require('compression')
const {
  listCustomers,
  chargeCustomers,
  stopCharging
} = require('./api')

const PORT = process.env.PORT || 3000
const PUBLIC_PATH = path.join(__dirname, '..', 'public')

app.use(express.json())
app.use(cors())
app.use(compression())
app.use(express.static(PUBLIC_PATH))

/**
 * @route POST /api/list-customers
 * 
 * @param {String} apiKey
 * @param {Object} filters
 * @param {String[]} filters.excludedIds
 * @param {Boolean} filters.refunded
 * @param {Boolean} filters.disputed
 * @param {Boolean} filters.expiredCard
 * @param {Boolean} filters.validCard
 * @param {Boolean} filters.chargedToday
 * 
 * @returns {Object[]} customers
 */
app.post('/api/list-customers', async (req, res) => {
  try {
    await listCustomers(req, res)
  } catch (e) {
    console.error('/api/list-customers', e)

    res.status(500).send({
      error: e.message
    })
  }
})

/**
 * @route POST /api/charge-customers
 * 
 * @param {String} apiKey
 * @param {Object[]} customerWithPaymentMethods
 * @param {Number} amount
 * @param {String} currency
 * @param {Number} chargePerSecond
 * @param {String} description
 * 
 * @returns {Object[]} customers
 */
app.post('/api/charge-customers', async (req, res) => {
  try {
    await chargeCustomers(req, res)
  } catch (e) {
    console.error('/api/charge-customers', e)

    res.status(500).send({
      error: e.message
    })
  }
})

/**
 * @route POST /api/stop-charging
 * 
 * @param {String} apiKey
 * 
 * @returns {Object[]} customers
 */
app.post('/api/stop-charging', async (req, res) => {
  try {
    await stopCharging(req, res)
  } catch (e) {
    console.error('/api/stop-charging', e)

    res.status(500).send({
      error: e.message
    })
  }
})

app.listen(PORT, () => console.log('Listening on port', PORT))