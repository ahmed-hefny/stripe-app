// Automatically pull changes from git
// Every 30 seconds it will pull changes from git
// if it found that git returned a string that starts with "Already up"
// then it means that our code is "Already up-to date" and there's 
// no new changes to be pulled
// If git returned something different than "Already up" then it means
// we have pulled a new code and we should runYarn() and reloadPm2()

// Don't forget to also copy pm2.config.js

const exec = require('child_process').exec
const CHECK_EVERY = 30 * 1000 // 30 seconds

const execAsync = (command, log = true) => new Promise((resolve, reject) => {
  if (log) console.log(command)

  exec(command, (error, stdout, stderr) => {
    if (error) reject(stderr)

    resolve(stdout)
  })
})

const promiseDelay = interval => new Promise(r => setTimeout(r, interval))
const pullChanges = () => execAsync('git pull -X theirs', false)
const runYarn = () => execAsync('npm install')
const reloadSlave = () => execAsync('pm2 reload stripe-api --update-env')
const reloadAutoDeploy = () => execAsync('pm2 reload autodeploy --update-env')
const savePm2ForStartup = () => execAsync('pm2 save')

const start = async () => {
  try {
    const pullData = await pullChanges()
    const hasNewCode = !pullData.startsWith('Already up')

    if (hasNewCode) {
      console.log('Found new code!')
      console.log(await runYarn())
      console.log(await savePm2ForStartup())
      console.log(await reloadSlave())

      // this will restart the script itself
      console.log(await reloadAutoDeploy())
    }
  } catch (e) {
    console.error('[Auto Deploy] error with auto deploy script', e)
  }

  await promiseDelay(CHECK_EVERY)
  start()
}

start()