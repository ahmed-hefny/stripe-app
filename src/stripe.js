const MAX_CUSTOMER_LIST = 100
const DAY_IN_MS = 24 * 60 * 60 * 1000

// eslint-disable-next-line no-unused-vars
class Stripe {
  constructor (stripeKey) {
    this.stripeKey = stripeKey
    this.baseUrl = 'https://api.stripe.com/v1'
    this.inProgress = false
  }

  async getReq (path, params = {}) {
    const url = `${this.baseUrl}/${path}`
    const queryString = Object.keys(params).map(key => key + '=' + params[key]).join('&')
    const endpoint = queryString
      ? `${url}?${queryString}`
      : url
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.stripeKey}`,
      },
    })

    return response.json()
  }

  async postReq (path, body = {}) {
    const url = `${this.baseUrl}/${path}`
    const urlSearch = new URLSearchParams(body)

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.stripeKey}`,
      },
      body: urlSearch.toString(),
    }

    const response = await fetch(url, requestOptions)

    return response.json()
  }

  async customersList (params = { limit: MAX_CUSTOMER_LIST }) {
    return this.getReq('customers', params)
  }

  async getAllCustomer () {
    let startAfter = null
    let hasMore
    const allCustomers = []

    do {
      const customers = startAfter
        ? await this.customersList({ limit: MAX_CUSTOMER_LIST, starting_after: startAfter })
        : await this.customersList({ limit: MAX_CUSTOMER_LIST })

      allCustomers.push(...customers.data)
      startAfter = customers.data[customers.data.length - 1].id
      hasMore = customers.has_more
    } while (hasMore)

    return allCustomers
  }

  async getExtendedCustomers () {
    const customers = await this.getAllCustomer()

    const promises = Promise.map(customers, async customer => {
      const [ { data: paymentMethod }, { data: charges } ] = await Promise.all([
        this.getCustomerPaymentMethod(customer),
        this.getCustomerCharges(customer)
      ])

      const extendedCustomer = {
        ...customer,
        paymentMethod: paymentMethod[0],
        charged: false,
        statuses: [],
        charges
      }

      this.setCustomerStatuses(extendedCustomer)

      return extendedCustomer
    }, { concurrency: 40 })

    return await Promise.all(promises)
  }

  setCustomerStatuses (customer) {
    const statuses = []
    const { paymentMethod, charges } = customer

    // Card statuses
    if (paymentMethod) {
      const { card } = paymentMethod
      const cardDate = new Date(card.exp_year, card.exp_month - 1)
      const currentDate = new Date()

      if (cardDate.getTime() < currentDate.getTime()) {
        statuses.push(this.createStatus('Expired Card', 'warning'))
        customer.cardExpired = true
      } else {
        statuses.push(this.createStatus('Valid Card', 'success'))
        customer.hasValidCard = true
      }
    } else {
      statuses.push(this.createStatus('No card', 'danger'))
    }

    // Charge statuses
    if (charges.length) {
      const hasRefundedCharge = charges.find(item => item.refunded)

      if (hasRefundedCharge) {
        statuses.push(this.createStatus('Refunded', 'secondary'))
        customer.isRefunded = true
      }
      const hasDisputedCharge = charges.find(item => item.disputed)

      if (hasDisputedCharge) {
        statuses.push(this.createStatus('Disputed', 'danger'))
        customer.isDisputed = true
      }
      const chargedToday = charges.filter(item => item.status === 'succeeded')
        .find(item => {
          const yesterdayMs = Date.now() - DAY_IN_MS

          return item.created * 1000 > yesterdayMs
        })

      if (chargedToday) {
        statuses.push(this.createStatus('Charged Today', 'info'))
        customer.chargedToday = true
      }
    }

    customer.statuses = statuses
  }

  async getCustomerPaymentMethod (customer) {
    return await this.getReq(`customers/${customer.id}/payment_methods`)
  }

  async getCustomerCharges (customer) {
    return await this.getReq('charges', { limit: 100, customer: customer.id })
  }

  async createChargeByPaymentIntent ({ amount, currency, customerId, paymentMethodId }) {
    const payload = {
      amount: amount,
      currency: currency,
      customer: customerId,
      description: 'Subscription',
      confirm: true,
      payment_method: paymentMethodId,
      'automatic_payment_methods[enabled]': true,
      return_url: window.origin
    }

    return this.postReq('payment_intents', payload)
  }

  async chargeCustomers (customers, { amount, currency }, concurrency = 1) {
    const promises = Promise.map(customers, async customer => {
      
      if (this.inProgress) {
        try {
          const { paymentMethod } = customer || {}

          if (paymentMethod) {
            const createdCharge = await this.createChargeByPaymentIntent({
              amount,
              currency,
              customerId: customer.id,
              paymentMethodId: paymentMethod.id
            })

            customer.charged = createdCharge.status === 'succeeded'
            customer.chargeError = createdCharge?.error?.decline_code || createdCharge?.outcome?.reason
            customer.charge = createdCharge
          } else {
            customer.chargeError = 'Customer has no payment method'
          }
        } catch (e) {
          customer.chargeError = 'INTERNAL ERROR - ' + e.message
        }

        return customer
      }
    }, { concurrency })

    return await promises.all(promises)
  }

  async checkKey () {
    try {
      const response = await this.getReq('customers', { limit: 1 })

      if (response.error) {
        throw response.error
      }
    } catch (e) {
      return e.message
    }
  }

  createStatus (name, color) {
    return { name, color }
  }
}
