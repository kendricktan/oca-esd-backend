const ethers = require('ethers')
const path = require('path')
const fs = require('fs')
const fetch = require('node-fetch')
const { parseEther, formatEther } = ethers.utils
const { critical, info } = require('./logging')

const {
  BOND_EVENT_DAO,
  BOND_EVENT_LP,
  UNBOND_EVENT,
  UNIV2_ESD_USDC_LP,
  COUPON_PURCHASE_EVENT_DAO,
  DAO_ADDRESS,
  LP_ADDRESS,
} = require('./constants')

const ETHERSCAN_API_KEY = 'QJPHEUVRS84V4KH16EG1YTUQMHJMH9PBBK'

const provider = new ethers.providers.InfuraProvider(
  1,
  '58073b4a32df4105906c702f167b91d2'
)

const etherscanProvider = new ethers.providers.EtherscanProvider(
  1,
  ETHERSCAN_API_KEY
)

const getDaoBondingEvents = async (startBlock, endBlock) => {
  // Gets bond/unbond events
  const bondUrl =
    'https://api.etherscan.io/api?module=logs&action=getLogs' +
    `&fromBlock=${startBlock}` +
    `&toBlock=${endBlock}` +
    `&address=${DAO_ADDRESS}` +
    `&topic0=${BOND_EVENT_DAO}` +
    `&apikey=${ETHERSCAN_API_KEY}`

  const unbondUrl =
    'https://api.etherscan.io/api?module=logs&action=getLogs' +
    `&fromBlock=${startBlock}` +
    `&toBlock=${endBlock}` +
    `&address=${DAO_ADDRESS}` +
    `&topic0=${UNBOND_EVENT}` +
    `&apikey=${ETHERSCAN_API_KEY}`

  const bondData = await fetch(bondUrl).then((x) => x.json())
  const unbondData = await fetch(unbondUrl).then((x) => x.json())

  const data = [...(bondData.result || []), ...(unbondData.result || [])]

  const addresses = data
    .map((x) => {
      return ethers.utils.defaultAbiCoder.decode(['address'], x.topics[1])[0]
    })
    .filter((v, i, a) => a.indexOf(v) === i)

  return addresses
}

const getCouponPurchaseEvents = async (startBlock, endBlock) => {
  // Gets coupon purchase events
  const couponEvents =
    'https://api.etherscan.io/api?module=logs&action=getLogs' +
    `&fromBlock=${startBlock}` +
    `&toBlock=${endBlock}` +
    `&address=${DAO_ADDRESS}` +
    `&topic0=${COUPON_PURCHASE_EVENT_DAO}` +
    `&apikey=${ETHERSCAN_API_KEY}`

  const couponData = await fetch(couponEvents).then((x) => x.json())

  const data = couponData.result || []

  const epochAndAddress = data
    .map((x) => {
      const address = ethers.utils.defaultAbiCoder.decode(
        ['address'],
        x.topics[1]
      )[0]
      const epoch = ethers.utils.defaultAbiCoder
        .decode(['uint256'], x.topics[2])[0]
        .toNumber()

      return {
        address,
        epoch,
      }
    })
    .reduce((acc, x) => {
      return { ...acc, [x.epoch]: [...(acc[x.epoch] || []), x.address] }
    }, {})

  return epochAndAddress
}

const getLpBondingEvents = async (startBlock, endBlock) => {
  // Gets bond/unbond events
  const bondUrl =
    'https://api.etherscan.io/api?module=logs&action=getLogs' +
    `&fromBlock=${startBlock}` +
    `&toBlock=${endBlock}` +
    `&address=${LP_ADDRESS}` +
    `&topic0=${BOND_EVENT_LP}` +
    `&apikey=${ETHERSCAN_API_KEY}`

  const unbondUrl =
    'https://api.etherscan.io/api?module=logs&action=getLogs' +
    `&fromBlock=${startBlock}` +
    `&toBlock=${endBlock}` +
    `&address=${LP_ADDRESS}` +
    `&topic0=${UNBOND_EVENT}` +
    `&apikey=${ETHERSCAN_API_KEY}`

  const bondData = await fetch(bondUrl).then((x) => x.json())
  const unbondData = await fetch(unbondUrl).then((x) => x.json())

  const data = [...(bondData.result || []), ...(unbondData.result || [])]

  const addresses = data
    .map((x) => {
      return ethers.utils.defaultAbiCoder.decode(['address'], x.topics[1])[0]
    })
    .filter((v, i, a) => a.indexOf(v) === i)

  return addresses
}

const Dao = new ethers.Contract(
  DAO_ADDRESS,
  require('../abi/DAO.json'),
  provider
)
const Lp = new ethers.Contract(LP_ADDRESS, require('../abi/LP.json'), provider)

const LpToken = new ethers.Contract(
  UNIV2_ESD_USDC_LP,
  require('../abi/UniswapPairV2.json'),
  provider
)

const One = ethers.BigNumber.from('1')
const Two = ethers.BigNumber.from('2')
const Three = ethers.BigNumber.from('3')
const Four = ethers.BigNumber.from('4')

const getDaoAccountStatus = async (curBlock, user) => {
  const [staged, bonded, fluidUntil] = (
    await Promise.all([
      Dao.balanceOfStaged(user, { blockTag: curBlock }),
      Dao.balanceOfBonded(user, { blockTag: curBlock }),
      Dao.fluidUntil(user, { blockTag: curBlock }),
    ])
  ).map((x) => x.toString())

  return {
    staged,
    bonded,
    fluidUntil,
  }
}

const getLpAccountStatus = async (curBlock, user) => {
  // accounts Mapping is at slot 5 in PoolStorage
  const loc = ethers.utils.solidityKeccak256(
    ['uint256', 'uint256'],
    [user, 5] // key, slot
  )

  const [staged, claimable, bonded, phantom, fluidUntil] = (
    await Promise.all([
      provider.getStorageAt(LP_ADDRESS, ethers.BigNumber.from(loc), curBlock),
      provider.getStorageAt(
        LP_ADDRESS,
        ethers.BigNumber.from(loc).add(One),
        curBlock
      ),
      provider.getStorageAt(
        LP_ADDRESS,
        ethers.BigNumber.from(loc).add(Two),
        curBlock
      ),
      provider.getStorageAt(
        LP_ADDRESS,
        ethers.BigNumber.from(loc).add(Three),
        curBlock
      ),
      provider.getStorageAt(
        LP_ADDRESS,
        ethers.BigNumber.from(loc).add(Four),
        curBlock
      ),
    ])
  ).map((x) => ethers.BigNumber.from(x).toString())

  return {
    staged,
    claimable,
    bonded,
    phantom,
    fluidUntil,
  }
}

const snapshotDao = async (curBlock, addresses) => {
  const snapshotLocation = path.join(__dirname, '../data/ESD-DAO.json')

  let existingData = {
    accounts: {},
  }
  if (fs.existsSync(snapshotLocation)) {
    existingData = JSON.parse(fs.readFileSync(snapshotLocation))
  }

  const totalBonded = await Dao.totalBonded()
  const totalStaged = await Dao.totalStaged()
  const totalSupply = await Dao.totalSupply()

  existingData.totalBonded = totalBonded.toString()
  existingData.totalStaged = totalStaged.toString()
  existingData.totalSupply = totalSupply.toString()
  existingData.lastUpdateBlock = curBlock.toString()

  for (let i = 0; i < addresses.length; i++) {
    const user = addresses[i]

    const data = await getDaoAccountStatus(curBlock, user)
    existingData.accounts[user] = data
  }

  fs.writeFileSync(snapshotLocation, JSON.stringify(existingData))
}

const snapshotLp = async (curBlock, addresses) => {
  const snapshotLocation = path.join(__dirname, '../data/ESD-LP.json')

  let existingData = {
    accounts: {},
  }
  if (fs.existsSync(snapshotLocation)) {
    existingData = JSON.parse(fs.readFileSync(snapshotLocation))
  }

  const totalBonded = await Lp.totalBonded({ blockTag: curBlock })
  const totalStaged = await Lp.totalStaged({ blockTag: curBlock })

  existingData.totalBonded = totalBonded.toString()
  existingData.totalStaged = totalStaged.toString()
  existingData.lastUpdateBlock = curBlock

  for (let i = 0; i < addresses.length; i++) {
    const user = addresses[i]

    const data = await getLpAccountStatus(curBlock, user)
    existingData.accounts[user] = data
  }

  // Saves UniV2 Data
  const esdPerUniv2 = await getEsdPerUniV2()
  existingData.esdPerUniV2 = formatEther(esdPerUniv2)
  fs.writeFileSync(snapshotLocation, JSON.stringify(existingData))
}

const getEsdPerUniV2 = async () => {
  const totalSupply = await LpToken.totalSupply()
  const [reserve0] = await LpToken.getReserves()

  // Calculate for LP
  const esdPerUniv2 = reserve0.mul(parseEther('1')).div(totalSupply)
  return esdPerUniv2
}

const updateSnapshot = async () => {
  const daoStats = require('../data/ESD-DAO.json')
  const lpStats = require('../data/ESD-LP.json')

  const curBlock = await provider.getBlockNumber()

  // Get sender txs
  const daoTxs = (
    await etherscanProvider.getHistory(DAO_ADDRESS, daoStats.lastUpdateBlock)
  )
    .map((x) => x.from)
    .filter((v, i, a) => a.indexOf(v) === i)
  const daoEvents = await getDaoBondingEvents(
    daoStats.lastUpdateBlock,
    curBlock
  )

  const newDaoAddresses = [...daoTxs, ...daoEvents].filter(
    (v, i, a) => a.indexOf(v) === i
  )

  const lpTxs = (
    await etherscanProvider.getHistory(LP_ADDRESS, lpStats.lastUpdateBlock)
  )
    .map((x) => x.from)
    .filter((v, i, a) => a.indexOf(v) === i)
  const lpEvents = await getLpBondingEvents(lpStats.lastUpdateBlock, curBlock)

  const newLpAddresses = [...lpTxs, ...lpEvents].filter(
    (v, i, a) => a.indexOf(v) === i
  )

  // Updates JSON data
  try {
    info(`Updating LP data with ${newDaoAddresses.length} new recipients`)
    await snapshotDao(curBlock, newDaoAddresses)
  } catch (e) {
    critical(`Failed to update DAO data: ${e.toString()}`)
  }

  try {
    info(`Updating DAO data with ${newLpAddresses.length} new recipients`)
    await snapshotLp(curBlock, newLpAddresses)
  } catch (e) {
    critical(`Failed to update LP data: ${e.toString()}`)
  }
}

module.exports = {
  updateSnapshot,
}

