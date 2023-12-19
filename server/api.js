const Stripe = require('stripe')
const { RateLimiter } = require('limiter')

const DAY_IN_MS = 24 * 60 * 60 * 1000
const MAX_STRIPE_REQS_PER_SECOND = 100
const STATE = {}

const addStatuses = ({ customer, charges, paymentMethods }) => {
  const statuses = []
  const [paymentMethod] = paymentMethods

  // Card statuses
  if (paymentMethod) {
    const { card } = paymentMethod
    const cardDate = new Date(card.exp_year, card.exp_month - 1)
    const currentDate = new Date()

    if (cardDate.getTime() < currentDate.getTime()) {
      statuses.push('EXPIRED_CARD')
    } else {
      statuses.push('VALID_CARD')
    }
  } else {
    statuses.push('NO_CARD')
  }

  // Charge statuses
  if (charges.length) {
    const hasRefundedCharge = charges.find(item => item.refunded)
    const hasDisputedCharge = charges.find(item => item.disputed)

    if (hasRefundedCharge) {
      statuses.push('REFUNDED')
    }

    if (hasDisputedCharge) {
      statuses.push('DISPUTED')
    }

    const chargedToday = charges.filter(item => item.status === 'succeeded')
      .find(item => {
        const yesterdayMs = Date.now() - DAY_IN_MS

        return item.created * 1000 > yesterdayMs
      })

    if (chargedToday) {
      statuses.push('CHARGED_TODAY')
    }
  }

  return {
    customer,
    statuses,
    charges,
    paymentMethods
  }
}

const filterCustomers = ({ customer, statuses, filters }) => {
  const shouldFilter = (filters.excludedIds && filters.excludedIds.includes(customer.id)) ||
    (filters.refunded && statuses.includes('REFUNDED')) ||
    (filters.disputed && statuses.includes('DISPUTED')) ||
    (filters.expiredCard && statuses.includes('EXPIRED_CARD')) ||
    (filters.validCard && !statuses.includes('VALID_CARD')) ||
    (filters.chargedToday && statuses.includes('CHARGED_TODAY'))

  return !shouldFilter
}

const listCustomers = async (req, res) => {
  const limiter = new RateLimiter({ tokensPerInterval: MAX_STRIPE_REQS_PER_SECOND, interval: 'second' })

  const {
    apiKey = '',
    filters = {},
  } = req.body

  const stripe = new Stripe(apiKey, {
    telemetry: false,
  })

  const iterator = stripe.customers.list({
    limit: 100,
  })

  const promises = []

  for await (const customer of iterator) {
    await limiter.removeTokens(2)
    promises.push([
      stripe.charges.list({
        limit: 100,
        customer: customer.id,
      }),
      stripe.customers.listPaymentMethods(customer.id),
      Promise.resolve(customer)
    ])
  }

  const customerPromises = promises.map(async ([chargePromise, paymentMethodPromise, customerPromise]) => {
    const [charges, paymentMethods, customer] = await Promise.all([
      chargePromise,
      paymentMethodPromise,
      customerPromise
    ])

    return {
      customer,
      charges: charges.data,
      paymentMethods: paymentMethods.data
    }
  })

  const customers = (await Promise.all(customerPromises))
    .map(addStatuses)
    .filter(data => filterCustomers({ ...data, filters }))
    .map(({ customer, paymentMethods, statuses }) => {
      const { id, email, name } = customer

      return {
        customer: {
          id,
          email,
          name
        },
        paymentMethodIds: paymentMethods.map(({ id: pmId }) => pmId),
        statuses
      }
    })

  res.send(customers)
}

const chargeCustomers = async (req, res) => {
  const {
    apiKey,
    customerWithPaymentMethods,
    amount,
    currency,
    chargePerSecond = 50,
    description = 'Subscription',
  } = req.body

  const limiter = new RateLimiter({ tokensPerInterval: MAX_STRIPE_REQS_PER_SECOND, interval: 'second' })

  // add to state
  STATE[apiKey] = {
    customers: [],
    inProgress: true,
  }

  for (const customer of customerWithPaymentMethods) {
    const tokensPerReq = isNaN(Number(chargePerSecond))
      ? 1
      : (MAX_STRIPE_REQS_PER_SECOND / Number(chargePerSecond))

    // check if frontend stopped charging
    if (STATE[apiKey].inProgress === false) {
      STATE[apiKey].customers.push({
        ...customer,
        charged: false,
        chargeError: 'Stopped charging - "STOP" button pressed'
      })

      continue
    }

    // wait for rate limiter
    await limiter.removeTokens(tokensPerReq)

    const { id: customerId, paymentMethodId } = customer
    const stripe = new Stripe(apiKey, {
      telemetry: false,
    })

    try {
      if (paymentMethodId) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          customer: customerId,
          description,
          confirm: true,
          payment_method: paymentMethodId,
          automatic_payment_methods: {
            enabled: true,
          },
          return_url: 'https://siriusb36-stripe.site'
        })

        console.log(paymentIntent)

        customer.charged = paymentIntent.status === 'succeeded'
        customer.chargeError = paymentIntent?.error?.decline_code || paymentIntent?.outcome?.reason
        customer.charge = paymentIntent
      } else {
        customer.charged = false
        customer.chargeError = 'Customer has no payment method'
      }
    } catch (e) {
      console.error('chargeCustomers', customerId, e)

      customer.charged = false
      customer.chargeError = 'INTERNAL ERROR - ' + e.message
    }

    STATE[apiKey].customers.push(customer)
  }

  STATE[apiKey].inProgress = false

  res.send(STATE[apiKey].customers)

  delete STATE[apiKey]
}

const stopCharging = async (req, res) => {
  const { apiKey } = req.body

  if (!STATE[apiKey]) {
    return res.send({ ok: false })
  }

  STATE[apiKey].inProgress = false

  res.send({ ok: true })
}
module.exports = {
  listCustomers,
  chargeCustomers,
  stopCharging
}