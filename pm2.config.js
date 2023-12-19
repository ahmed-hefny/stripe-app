module.exports = {
  apps: [
    {
      name: 'stripe-api',
      cwd: 'server',
      script: 'index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      args: ['--colors']
    },
    {
      name: 'autodeploy',
      script: 'autodeploy.js',
      env: {
        NODE_ENV: 'production'
      },
      args: ['--colors']
    },
  ]
}
