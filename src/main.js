/* global web3 */

import _ from 'lodash'
import {
  filterAbiFunctions,
  transactionFunctionNames
} from './abiParser'
import stateOutput from './stateOutput.js'
import transactionOutput from './transactionOutput.js'

function getBalance (address) {
  return web3.eth.getBalance(address).toNumber()
}

async function contractState (contractInstance) {
  const fns = filterAbiFunctions(contractInstance.abi, {
    isConstant: true,
    hasInputs: false
  })
  const results = await Promise.all(_.map(fns, (fn) => {
    return contractInstance[fn.name].call()
  }))
  let props = {}
  for (let i = 0; i < fns.length; i++) {
    let result = results[i]
    if (fns[i].outputs && fns[i].outputs[0] && fns[i].outputs[0].type === 'address') {
      result = {
        address: result,
        balance: getBalance(result)
      }
    }
    props[fns[i].name] = result
  }
  const balance = getBalance(contractInstance.address)
  const { address } = contractInstance
  const { contract_name: name } = contractInstance.constructor._json

  return {
    balance,
    props,
    output: () => stateOutput(name, address, balance, props)
  }
}

function wrapTxFunction (contractInstance, fnName) {
  const txFn = contractInstance[fnName]
  return async function () {
    let tx = await txFn.apply(this, Array.prototype.slice.call(arguments))
    return _.assign(
      tx,
      { output: () => transactionOutput(tx) }
    )
  }
}

function transactionFns (contractInstance) {
  const txFnNames = transactionFunctionNames(contractInstance.abi)
  let txFns = {}
  _.forEach(txFnNames, (fnName) => {
    txFns[fnName] = wrapTxFunction(contractInstance, fnName)
  })
  return txFns
}

function wrapContractInstance (contractInstance) {
  return _.assign(
    contractInstance,
    transactionFns(contractInstance),
    { state: async () => contractState(contractInstance) }
  )
}

function wrapContractFn (fn) {
  return async function () {
    const c = await fn.apply(this, Array.prototype.slice.call(arguments))
    return wrapContractInstance(c)
  }
}

function wrapContractArtifact (contractArtifact) {
  _.forEach(['new', 'at'], (fnName) => {
    contractArtifact[fnName] = wrapContractFn(contractArtifact[fnName])
  })
  return contractArtifact
}

export function requireContract (contractArtifact) {
  return wrapContractArtifact(contractArtifact)
}