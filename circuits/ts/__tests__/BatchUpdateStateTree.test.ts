import * as fs from 'fs'
import * as path from 'path'
import { Circuit } from 'snarkjs'
const compiler = require('circom')

import { str2BigInt } from './utils'
import { compileAndLoadCircuit } from '../'
import { config } from 'maci-config'
import { MaciState } from 'maci-core'

import {
    Keypair,
    StateLeaf,
    Command,
    Message,
    PubKey,
} from 'maci-domainobjs'

import {
    IncrementalMerkleTree,
    genRandomSalt,
    Plaintext,
    hash,
    SnarkBigInt,
    PrivKey,
    bigInt,
    stringifyBigInts,
    NOTHING_UP_MY_SLEEVE,
} from 'maci-crypto'

import {
    SnarkProvingKey,
    SnarkVerifyingKey,
    genProof,
    genPublicSignals,
    verifyProof,
    parseVerifyingKeyJson,
} from 'libsemaphore'

jest.setTimeout(1200000)

const provingKeyPath = path.join(__dirname, '../../build/batchUstPk.bin')
const provingKey: SnarkProvingKey = fs.readFileSync(provingKeyPath)

const verifyingKeyPath = path.join(__dirname, '../../build/batchUstVk.json')
const verifyingKey: SnarkVerifyingKey = parseVerifyingKeyJson(fs.readFileSync(verifyingKeyPath).toString())

const batchSize = config.maci.messageBatchSize
const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex
const initialVoiceCreditBalance = config.maci.initialVoiceCreditBalance

const randomRange = (min: number, max:number) => {
  return Math.floor(Math.random() * (max - min) + min)
}

// Set up keypairs
const user = new Keypair()
const coordinator = new Keypair()

describe('State tree root update verification circuit', () => {
    let circuit 

    const maciState = new MaciState(
        coordinator,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        voteOptionsMaxIndex,
    )

    beforeAll(async () => {
        circuit = await compileAndLoadCircuit('batchUpdateStateTree_test.circom')

        // Sign up the user
        maciState.signUp(user.pubKey, initialVoiceCreditBalance)
    })

    it('BatchUpdateStateTree should produce the correct state root', async () => {
        // Generate four valid messages from the same user
        const voteWeight = bigInt(2)
        const totalVoiceCreditsSpent = bigInt(4) * voteWeight.pow(bigInt(2))
        let commands: Command[] = []
        let messages: Message[] = []
        const stateRootBefore = maciState.genStateRoot()

        for (let i = 0; i < 4; i++) {
            const command = new Command(
                bigInt(1),
                user.pubKey,
                bigInt(0),
                voteWeight,
                bigInt(i + 1),
                genRandomSalt(),
            )
            const signature = command.sign(user.privKey)
            const sharedKey = Keypair.genEcdhSharedKey(user.privKey, coordinator.pubKey)
            const message = command.encrypt(signature, sharedKey)

            commands.push(commands)
            messages.push(message)

            maciState.publishMessage(message, user.pubKey)
        }

        const randomStateLeaf = StateLeaf.genRandomLeaf()

        // Generate circuit inputs
        const circuitInputs = 
            maciState.genBatchUpdateStateTreeCircuitInputs(
                0,
                batchSize,
                randomStateLeaf,
            )

        // Calculate the witness
        const witness = circuit.calculateWitness(circuitInputs)
        expect(circuit.checkWitness(witness)).toBeTruthy()

        // Get the circuit-generated root
        const idx = circuit.getSignalIdx('main.root')
        const circuitNewStateRoot = witness[idx].toString()

        // Process the batch of messages
        maciState.batchProcessMessage(
            0,
            batchSize,
            randomStateLeaf,
        )

        const stateRootAfter = maciState.genStateRoot()

        expect(stateRootBefore.toString()).not.toEqual(stateRootAfter)

        // After we run process the message via maciState.processMessage(),
        // the root generated by the circuit should match
        expect(circuitNewStateRoot.toString()).toEqual(stateRootAfter.toString())
    })
})