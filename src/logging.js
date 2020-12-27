const chalk = require('chalk')

const log = (...args) => {
  const now = new Date()
  console.log(`[${now.toString()}]`, ...args)
}

const warn = (...args) => {
  log(chalk.yellowBright(...args))
}

const debug = (...args) => {
  log(chalk.magenta(...args))
}

const info = (...args) => {
  log(chalk.blueBright(...args))
}

const critical = (...args) => {
  log(chalk.redBright(...args))
}

const success = (...args) => {
  log(chalk.greenBright(...args))
}

const notset = (...args) => {
  log(chalk.grey(...args))
}

module.exports = {
  warn,
  debug,
  info,
  critical,
  success,
  notset,
}
