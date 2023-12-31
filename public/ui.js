/* global swal  */
const $ = selector => document.querySelector(selector)
const baseAPI = 'https://siriusb36-stripe.site/api'
let ALL_CUSTOMERS

const els = {
  $applyFilter: $('#applyFilter'),
  $tableData: $('#table-records'),
  $amount: $('#chargeAmount'),
  $currency: $('#currency'),
  $concurrency: $('#concurrency'),
  $expectedTotal: $('#expectedTotalAmount'),
  $actualTotal: $('#actualTotalAmount'),
  $chargeBtn: $('#charge'),
  $description: $('#description')
}

const actionButtons = {
  charge: 'Charge',
  stop: 'Stop',
}

const displayCustomers = async () => {
  const key = $('#secretKey').value

  if (!key.length) {
    swal('Oops', 'Key is Empty', 'error')

    return
  }

  // const keyError = await STRIPE.checkKey()

  // if (keyError) {
  //   swal('Oops', keyError, 'error')

  //   return
  // }

  startLoader(els.$applyFilter)
  els.$chargeBtn.disabled = true
  els.$chargeBtn.innerHTML = getSpinnerHTML('primary', 1)
  $('.table-responsive').style.overflowY = 'hidden'
  els.$tableData.innerHTML = `<th class="text-center" colspan="5">${getSpinnerHTML('secondary', 15)}</th>`
  setSecretKey(key)
  const excludedIds = $('#excludedIDS').value.trim().split(/(,|\s+|\n)/).map(item => item.trim()).filter(Boolean)
  const refundedBox = $('#refundedBox').checked
  const disputedBox = $('#disputedBox').checked
  const expiredBox = $('#expiredBox').checked
  const chargedBox = $('#chargedBox').checked
  const validBox = $('#validBox').checked

  const body = {
    apiKey: key,
    filters: {}
  }

  if (excludedIds?.length) {
    body.filters.excludedIds = excludedIds
  }

  if (refundedBox) {
    body.filters.refunded = true
  }
  if (disputedBox) {
    body.filters.disputed = true
  }
  if (expiredBox) {
    body.filters.expiredCard = true
  }
  if (validBox) {
    body.filters.validCard = true
  }
  if (chargedBox) {
    body.filters.chargedToday = true
  }
  if (body.filters == true) {
    body.filters = undefined
  }
  try {
    const result = await fetch(`${baseAPI}/list-customers`, createReqOptions(body))
    ALL_CUSTOMERS = await result.json()

    if (ALL_CUSTOMERS.error) {
      swal('Oops', ALL_CUSTOMERS.error, 'error')
    }

    els.$tableData.innerHTML = ''
    if (ALL_CUSTOMERS?.length) {
      if (ALL_CUSTOMERS.length > 100) {
        $('.table-responsive').style.overflowY = 'auto'
      }
      ALL_CUSTOMERS.forEach(renderObj)
    }
    calculateTotal()
  } catch (error) {
    swal('Oops', error.message, 'error')
  }

  els.$chargeBtn.disabled = false
  els.$chargeBtn.innerHTML = actionButtons.charge

  stopLoad(els.$applyFilter)
}

// const filterCustomers = (customers) => {
//   const excludedIds = $('#excludedIDS').value.trim().split(/(,|\s+|\n)/).map(item => item.trim()).filter(Boolean)
//   const refundedBox = $('#refundedBox').checked
//   const disputedBox = $('#disputedBox').checked
//   const expiredBox = $('#expiredBox').checked
//   const chargedBox = $('#chargedBox').checked
//   const validBox = $('#validBox').checked

//   return customers.filter(cus =>
//     (!excludedIds.includes(cus.id)) &&
//       (refundedBox ? !cus.isRefunded : true) &&
//       (disputedBox ? !cus.isDisputed : true) &&
//       (expiredBox ? !cus.cardExpired : true) &&
//       (validBox ? cus.hasValidCard : true) &&
//       (chargedBox ? !cus.chargedToday : true)
//   )
// }

const downloadChargedCustomers = () => {
  const data = ALL_CUSTOMERS.map((cus, i) => ({
    '#': i + 1,
    id: cus.customer.id,
    email: cus.customer.email,
    charged: cus.charged ? 'Yes' : 'No',
    error: cus.chargeError
  }))

  const convertToCSV = results => {
    const header = Object.keys(results[0]).join(',')
    const rows = results.map(obj => Object.values(obj).join(','))

    return `${header}\n${rows.join('\n')}`
  }

  const downloadCSV = results => {
    const csvString = convertToCSV(results)
    const blob = new Blob([csvString], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'data.csv'
    document.body.appendChild(a)
    a.click()

    window.URL.revokeObjectURL(url)
  }

  if (data.length) {
    downloadCSV(data)
  } else {
    downloadEmptyFile()
  }
}
const downloadEmptyFile = () => {
  const emptyCSV = ''
  const emptyBlob = new Blob([emptyCSV], { type: 'text/csv' })

  const emptyUrl = window.URL.createObjectURL(emptyBlob)

  const a = document.createElement('a')
  a.href = emptyUrl
  a.download = 'data.csv'
  document.body.appendChild(a)
  a.click()

  window.URL.revokeObjectURL(emptyUrl)
}
const changeChargeBtnText = (name) => els.$chargeBtn.innerText = name

const chargeBtnCustomers = () => {
  if (els.$chargeBtn.innerText === actionButtons.charge) {
    swal(`Are you sure you want to ${els.$chargeBtn.innerText}`, {
      buttons: {
        cancel: true,
        confirm: true,
      }
    })
      .then((value) => {
        if (value) {
          chargeCustomers()
        }
      })
  } else {
    stopChargingCustomers()
  }
}

const stopChargingCustomers = async () => {
  const apiKey = $('#secretKey').value

  if (!apiKey.length) {
    swal('Oops', 'Key is Empty', 'error')

    return
  }

  const result = await fetch(`${baseAPI}/stop-charging`, createReqOptions({ apiKey }))
  const data = await result.json()

  if (data.ok) {
    swal({
      title: 'Stopped',
      text: 'Charging stopped!',
      icon: 'error'
    })
  }
}

const chargeCustomers = async () => {
  const amount = $('#chargeAmount').value * 100

  if (amount > 0) {
    if (ALL_CUSTOMERS.length) {
      changeChargeBtnText(actionButtons.stop)
      let actualAmount = 0
      const currency = els.$currency.value
      const chargePerSecond = +els.$concurrency.value
      const description = els.$description.value ? els.$description.value.trim() : 'Subscription'
      const apiKey = $('#secretKey').value

      const body = {
        apiKey,
        amount,
        description,
        currency,
        chargePerSecond,
        customerWithPaymentMethods: ALL_CUSTOMERS.map(cus => ({
          id: cus?.customer?.id, email: cus.customer?.email, name: cus?.customer?.name, paymentMethodId: cus?.paymentMethodIds[0]
        }))
      }
      els.$tableData.innerHTML = `<th class="text-center" colspan="5">${getSpinnerHTML('secondary', 15)}</th>`
      ALL_CUSTOMERS.forEach(cus => {cus.charged = false})
      const result = await fetch(`${baseAPI}/charge-customers`, createReqOptions(body))
      const chargedCustomersList = await result.json()
      chargedCustomersList.forEach(customer => {
        const cus = ALL_CUSTOMERS.find(item => item.customer.id === customer.id)

        if (customer.charged) {
          cus.charged = customer.charged
          actualAmount += customer?.charge?.amount / 100
        } else {
          cus.chargeError = customer.chargeError
        }
      })

      els.$tableData.innerHTML = ''

      ALL_CUSTOMERS.forEach(renderObj)
      els.$actualTotal.innerText = `${actualAmount} ${els.$currency.value}`
      changeChargeBtnText(actionButtons.charge)

      downloadChargedCustomers()
    } else {
      swal('Oops', 'No Customers to Charge :)', 'error')
    }
  } else {
    swal('Oops', 'Charge amount is invalid', 'error')
  }
}

const calculateTotal = () => {
  const amount = $('#chargeAmount').value
  const currency = $('#currency').value
  els.$expectedTotal.innerText = ` ${amount ? amount * (ALL_CUSTOMERS?.length ? ALL_CUSTOMERS?.length : 0) : 0} ${currency}`
}

const getStatuesHTML = (list = []) => {
  let html = ''
  list.forEach(status => {
    let bgColor = ''

    switch (status.toLowerCase()) {
      case 'expired_card':
        bgColor = 'warning'
        break
      case 'valid card':
      case 'valid_card':
        bgColor = 'success'
        break
      case 'no_card':
      case 'disputed':
        bgColor = 'danger'
        break
      case 'refunded':
        bgColor = 'secondary'
        break
      case 'charged_today':
        bgColor = 'info'
        break
      default:
        bgColor = 'success'
        break
    }
    status = status.replace('_', ' ')
    html += `<span class="me-2 mt-2 mt-lg-0 badge d-inline-block bg-${bgColor}">${status}</span>`
  })

  return html
}

const renderObj = (obj, index) => {
  const tr = document.createElement('tr')
  const bgColor = obj.charged
    ? 'success'
    : obj.chargeError
      ? 'danger'
      : 'secondary'
  const chargedStatus = obj.charged
    ? 'Yes'
    : obj.chargeError
      ? obj.chargeError
      : 'No'

  const statusHtml = getStatuesHTML(obj.statuses)

  tr.innerHTML = `
    <th scope="row">${index + 1}</th>
    <td >${obj?.customer?.id}</td>
    <td>${obj?.customer?.email}</td>
    <td> 
      <div class="d-flex flex-wrap">
        ${statusHtml}
      </div>
    </td>
    <td>
      <span class="badge bg-${bgColor}">${chargedStatus}</span>
    </td>
   `
  els.$tableData.appendChild(tr)
}

const getSpinnerHTML = (color, size = '2') => `<div style="width: ${size}rem; height: ${size}rem;" class="spinner-border text-${color}" role="status">
<span class="visually-hidden">Loading...</span>
</div>`

const startLoader = el => {
  el.disabled = true
  el.querySelector('[role="loader"]').classList.remove('d-none')
}
const stopLoad = el => {
  el.disabled = false
  el.querySelector('[role="loader"]').classList.add('d-none')
}

const setSecretKey = (secretKey) => {
  const date = new Date()
  date.setTime(date.getTime() + (24 * 60 * 60 * 1000))
  const expires = 'expires=' + date.toUTCString()
  document.cookie = 'secretKey' + '=' + secretKey + ';' + expires + ';path=/'
}

const getSecretKey = () => {
  const cookieName = 'secretKey='
  const decodedCookie = decodeURIComponent(document.cookie)
  const cookieArray = decodedCookie.split(';')

  for (let i = 0; i < cookieArray.length; i++) {
    let cookie = cookieArray[i]

    while (cookie.charAt(0) === ' ') {
      cookie = cookie.substring(1)
    }

    if (cookie.indexOf(cookieName) === 0) {
      return cookie.substring(cookieName.length, cookie.length)
    }
  }

  return null
}
const createReqOptions = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
  ...(body && { body: JSON.stringify(body) }),
})

// init listeners
const initListeners = () => {
  els.$amount.addEventListener('keyup', calculateTotal)
  els.$currency.addEventListener('change', calculateTotal)
  els.$applyFilter.addEventListener('click', displayCustomers)
  els.$chargeBtn.addEventListener('click', chargeBtnCustomers)
}

const init = () => {
  initListeners()

  $('#secretKey').value = getSecretKey()
}

init()