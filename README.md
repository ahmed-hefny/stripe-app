# Siriusb 36

Batch charging Stripe customers based on filters

## Requirements
- node.js v16+
- npm

## Getting Started

```bash
npm i
npm run dev

# Listening on port 3000
# App available at http://localhost:3000
```

## Features
1. Charge Stripe Customers with filtration
2. Charge Stripe Customers with demanded amounts, currencies, charge description and how many charge could be done per second
3. See Stripe Customers with different filtration 

Filter by:
1. Refunded (Customer refunded a charge)
2. Disputed (Customer disputed a charge)
3. Card has expired
4. Only show customers with valid card
5. Customers that were charged today
6. Exclude certain customer IDs
