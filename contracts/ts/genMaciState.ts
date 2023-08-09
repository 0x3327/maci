import { Keypair, PubKey, Message } from 'maci-domainobjs';

import { parseArtifact } from './';

import { MaciState } from 'maci-core';

import * as ethers from 'ethers';
import * as assert from 'assert';

interface Action {
	type: string;
	data: any;
	blockNumber: number;
	transactionIndex: number;
}

const genMaciStateFromContract = async (
	provider: ethers.providers.Provider,
	address: string,
	coordinatorKeypair: Keypair,
	pollId: number,
	fromBlock: number = 0
): Promise<MaciState> => {
	pollId = Number(pollId);
	// Verify and sort pollIds
	assert(pollId >= 0);

	const [pollContractAbi] = parseArtifact('Poll');
	const [maciContractAbi] = parseArtifact('MACI');
	const [mpContractAbi] = parseArtifact('MessageProcessor');

	const maciContract = new ethers.Contract(address, maciContractAbi, provider);

	const maciIface = new ethers.utils.Interface(maciContractAbi);
	const pollIface = new ethers.utils.Interface(pollContractAbi);
	const mpIface = new ethers.utils.Interface(mpContractAbi);

	const maciState = new MaciState();

	// Check stateTreeDepth
	const stateTreeDepth = await maciContract.stateTreeDepth();
	assert(stateTreeDepth === maciState.stateTreeDepth);

	// Fetch event logs
	const initLogs = await provider.getLogs({
		...maciContract.filters.Init(),
		fromBlock: fromBlock,
	});

	// init() should only be called up to 1 time
	assert(
		initLogs.length <= 1,
		'More than 1 init() event detected which should not be possible'
	);

	const signUpLogs = await provider.getLogs({
		...maciContract.filters.SignUp(),
		fromBlock: fromBlock,
	});

	const mergeStateAqSubRootsLogs = await provider.getLogs({
		...maciContract.filters.MergeStateAqSubRoots(),
		fromBlock: fromBlock,
	});

	const mergeStateAqLogs = await provider.getLogs({
		...maciContract.filters.MergeStateAq(),
		fromBlock: fromBlock,
	});

	const deployPollLogs = await provider.getLogs({
		...maciContract.filters.DeployPoll(),
		fromBlock: fromBlock,
	});

	let vkRegistryAddress;

	for (const log of initLogs) {
		const event = maciIface.parseLog(log);
		vkRegistryAddress = event.args._vkRegistry;
	}

	const actions: Action[] = [];

	for (const log of signUpLogs) {
		assert(log != undefined);
		const event = maciIface.parseLog(log);
		actions.push({
			type: 'SignUp',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				stateIndex: Number(event.args._stateIndex),
				pubKey: new PubKey(event.args._userPubKey.map((x) => BigInt(x))),
				voiceCreditBalance: Number(event.args._voiceCreditBalance),
				timestamp: Number(event.args._timestamp),
			},
		});
	}

	// TODO: consider removing MergeStateAqSubRoots and MergeStateAq as the
	// functions in Poll which call them already have their own events
	for (const log of mergeStateAqSubRootsLogs) {
		assert(log != undefined);
		const event = maciIface.parseLog(log);
		const p = Number(event.args._pollId);

		//// Skip in favour of Poll.MergeMaciStateAqSubRoots
		//if (p === pollId) {
		//continue
		//}

		actions.push({
			type: 'MergeStateAqSubRoots',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				numSrQueueOps: Number(event.args._numSrQueueOps),
				pollId: p,
			},
		});
	}

	for (const log of mergeStateAqLogs) {
		assert(log != undefined);
		const event = maciIface.parseLog(log);
		const p = Number(event.args._pollId);

		//// Skip in favour of Poll.MergeMaciStateAq
		//if (p === pollId) {
		//continue
		//}

		actions.push({
			type: 'MergeStateAq',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				pollId: p,
			},
		});
	}

	let i = 0;
	const foundPollIds: number[] = [];
	const pollContractAddresses: string[] = [];
	for (const log of deployPollLogs) {
		assert(log != undefined);
		const event = maciIface.parseLog(log);
		const pubKey = new PubKey(
			event.args._pubKey.map((x) => BigInt(x.toString()))
		);

		const pollId = Number(event.args._pollId);
		assert(pollId === i);

		const pollAddr = event.args._pollAddr;
		actions.push({
			type: 'DeployPoll',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: { pollId, pollAddr, pubKey },
		});

		foundPollIds.push(Number(pollId));
		pollContractAddresses.push(pollAddr);
		i++;
	}

	// Check whether each pollId exists
	assert(
		foundPollIds.indexOf(Number(pollId)) > -1,
		'Error: the specified pollId does not exist on-chain'
	);

	const pollContractAddress = pollContractAddresses[pollId];
	const pollContract = new ethers.Contract(
		pollContractAddress,
		pollContractAbi,
		provider
	);

	const mpContractAddress = await pollContract.messageProcessorAddress();

	const mpContract = new ethers.Contract(
		mpContractAddress,
		mpContractAbi,
		provider
	);

	// const coordinatorPubKeyOnChain = await pollContract.coordinatorPubKey();
	// assert(
	// 	coordinatorPubKeyOnChain[0].toString() ===
	// 		coordinatorKeypair.pubKey.rawPubKey[0].toString()
	// );
	// assert(
	// 	coordinatorPubKeyOnChain[1].toString() ===
	// 		coordinatorKeypair.pubKey.rawPubKey[1].toString()
	// );

	const dd = await pollContract.getDeployTimeAndDuration();
	const deployTime = Number(dd[0]);
	const duration = Number(dd[1]);
	const onChainMaxValues = await pollContract.maxValues();
	const onChainTreeDepths = await pollContract.treeDepths();
	const onChainBatchSizes = await pollContract.batchSizes();

	assert(vkRegistryAddress === (await maciContract.vkRegistry()));

	const maxValues = {
		maxMessages: Number(onChainMaxValues.maxMessages.toNumber()),
		maxVoteOptions: Number(onChainMaxValues.maxVoteOptions.toNumber()),
	};
	const treeDepths = {
		intStateTreeDepth: Number(onChainTreeDepths.intStateTreeDepth),
		messageTreeDepth: Number(onChainTreeDepths.messageTreeDepth),
		messageTreeSubDepth: Number(onChainTreeDepths.messageTreeSubDepth),
		voteOptionTreeDepth: Number(onChainTreeDepths.voteOptionTreeDepth),
	};
	const batchSizes = {
		tallyBatchSize: Number(onChainBatchSizes.tallyBatchSize),
		subsidyBatchSize: Number(onChainBatchSizes.subsidyBatchSize),
		messageBatchSize: Number(onChainBatchSizes.messageBatchSize),
	};

	const attemptKeyDeactivationLogs = await provider.getLogs({
		...pollContract.filters.AttemptKeyDeactivation(),
		fromBlock: fromBlock,
	});

	const publishMessageLogs = await provider.getLogs({
		...pollContract.filters.PublishMessage(),
		fromBlock: fromBlock,
	});

	const topupLogs = await provider.getLogs({
		...pollContract.filters.TopupMessage(),
		fromBlock: fromBlock,
	});

	const mergeMaciStateAqSubRootsLogs = await provider.getLogs({
		...pollContract.filters.MergeMaciStateAqSubRoots(),
		fromBlock: fromBlock,
	});

	const mergeMaciStateAqLogs = await provider.getLogs({
		...pollContract.filters.MergeMaciStateAq(),
		fromBlock: fromBlock,
	});

	const mergeMessageAqSubRootsLogs = await provider.getLogs({
		...pollContract.filters.MergeMessageAqSubRoots(),
		fromBlock: fromBlock,
	});

	const mergeMessageAqLogs = await provider.getLogs({
		...pollContract.filters.MergeMessageAq(),
		fromBlock: fromBlock,
	});

	const attemptKeyGenerationLogs = await provider.getLogs({
		...pollContract.filters.AttemptKeyGeneration(),
		fromBlock: fromBlock,
	});

	const deactivateKeyLogs = await provider.getLogs({
		...mpContract.filters.DeactivateKey(),
		fromBlock: fromBlock,
	});

	for (const log of publishMessageLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const message = new Message(
			BigInt(event.args._message[0]),
			event.args._message[1].map((x) => BigInt(x))
		);

		const encPubKey = new PubKey(
			event.args._encPubKey.map((x) => BigInt(x.toString()))
		);

		actions.push({
			type: 'PublishMessage',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				message,
				encPubKey,
			},
		});
	}

	for (const log of attemptKeyDeactivationLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const message = new Message(
			BigInt(event.args._message[0]),
			event.args._message[1].map((x) => BigInt(x))
		);

		const encPubKey = new PubKey(
			event.args._encPubKey.map((x) => BigInt(x.toString()))
		);

		actions.push({
			type: 'AttemptKeyDeactivation',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				message,
				encPubKey,
			},
		});
	}

	for (const log of topupLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const message = new Message(
			BigInt(event.args._message[0]),
			event.args._message[1].map((x) => BigInt(x))
		);

		actions.push({
			type: 'TopupMessage',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				message,
			},
		});
	}

	for (const log of mergeMaciStateAqSubRootsLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const numSrQueueOps = Number(event.args._numSrQueueOps);
		actions.push({
			type: 'MergeMaciStateAqSubRoots',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				numSrQueueOps,
			},
		});
	}

	for (const log of mergeMaciStateAqLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const stateRoot = BigInt(event.args._stateRoot);
		actions.push({
			type: 'MergeMaciStateAq',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: { stateRoot },
		});
	}

	for (const log of mergeMessageAqSubRootsLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const numSrQueueOps = Number(event.args._numSrQueueOps);
		actions.push({
			type: 'MergeMessageAqSubRoots',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				numSrQueueOps,
			},
		});
	}

	for (const log of mergeMessageAqLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const messageRoot = BigInt(event.args._messageRoot);
		actions.push({
			type: 'MergeMessageAq',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: { messageRoot },
		});
	}

	for (const log of attemptKeyGenerationLogs) {
		assert(log != undefined);
		const event = pollIface.parseLog(log);

		const message = new Message(
			BigInt(event.args._message[0]),
			event.args._message[1].map((x) => BigInt(x))
		);

		const encPubKey = new PubKey(
			event.args._encPubKey.map((x) => BigInt(x.toString()))
		);

		const newStateIndex = Number(event.args._newStateIndex);

		actions.push({
			type: 'AttemptKeyGeneration',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				message,
				encPubKey,
				newStateIndex
			},
		});
	}

	for (const log of deactivateKeyLogs) {
		assert(log != undefined);
		const event = mpIface.parseLog(log);

		actions.push({
			type: 'DeactivateKey',
			// @ts-ignore
			blockNumber: log.blockNumber,
			// @ts-ignore
			transactionIndex: log.transactionIndex,
			data: {
				keyHash: event.args.keyHash,
				c1: event.args.c1,
				c2: event.args.c2
			},
		});
	}

	// Sort actions
	sortActions(actions);

	// Reconstruct MaciState in order

	for (const action of actions) {
		if (action['type'] === 'SignUp') {
			maciState.signUp(
				action.data.pubKey,
				action.data.voiceCreditBalance,
				action.data.timestamp
			);
		} else if (action['type'] === 'DeployPoll') {
			if (action.data.pollId === pollId) {
				maciState.deployPoll(
					duration,
					BigInt(deployTime + duration),
					maxValues,
					treeDepths,
					batchSizes.messageBatchSize,
					coordinatorKeypair
				);
			} else {
				maciState.deployNullPoll();
			}
		} else if (action['type'] === 'PublishMessage') {
			// TODO: Pass coord PK if coord invokes
			if (!coordinatorKeypair) {
				continue;
			}
			maciState.polls[pollId].publishMessage(
				action.data.message,
				action.data.encPubKey
			);
		} else if (action['type'] === 'AttemptKeyDeactivation') {
			// TODO: Pass coord PK if coord invokes
			if (!coordinatorKeypair) {
				continue;
			}
			maciState.polls[pollId].deactivateKey(
				action.data.message,
				action.data.encPubKey
			);
		} else if (action['type'] === 'DeactivateKey') {
			maciState.polls[pollId].processDeactivateKeyEvent(
				action.data.keyHash,
				action.data.c1,
				action.data.c2
			);
		} else if (action['type'] === 'TopupMessage') {
			maciState.polls[pollId].topupMessage(action.data.message);
		} else if (action['type'] === 'MergeMaciStateAqSubRoots') {
			maciState.stateAq.mergeSubRoots(action.data.numSrQueueOps);
		} else if (action['type'] === 'MergeMaciStateAq') {
			if (pollId == 0) {
				maciState.stateAq.merge(stateTreeDepth);
			}
		} else if (action['type'] === 'MergeMessageAqSubRoots') {
			maciState.polls[pollId].messageAq.mergeSubRoots(
				action.data.numSrQueueOps
			);
		} else if (action['type'] === 'MergeMessageAq') {
			maciState.polls[pollId].messageAq.merge(treeDepths.messageTreeDepth);
			const poll = maciState.polls[pollId];
			assert(
				poll.messageAq.mainRoots[treeDepths.messageTreeDepth] ===
					action.data.messageRoot
			);
		} else if (action['type'] === 'AttemptKeyGeneration') {
			// TODO: Pass coord PK if coord invokes
			if (!coordinatorKeypair) {
				continue;
			}
			maciState.polls[pollId].generateNewKey(
				action.data.message,
				action.data.encPubKey,
				action.data.newStateIndex
			);
		}
	}

	// Set numSignUps
	const [numSignUps, numMessages] =
		await pollContract.numSignUpsAndMessagesAndDeactivatedKeys();

	const poll = maciState.polls[pollId];

	if (coordinatorKeypair) {
		assert(Number(numMessages) === poll.messages.length);
	}

	maciState.polls[pollId].numSignUps = Number(numSignUps);

	return maciState;
};

/*
 * The comparision function for Actions based on block number and transaction
 * index.
 */
const sortActions = (actions: Action[]) => {
	actions.sort((a, b) => {
		if (a.blockNumber > b.blockNumber) {
			return 1;
		}
		if (a.blockNumber < b.blockNumber) {
			return -1;
		}

		if (a.transactionIndex > b.transactionIndex) {
			return 1;
		}
		if (a.transactionIndex < b.transactionIndex) {
			return -1;
		}
		return 0;
	});
	return actions;
};

export { genMaciStateFromContract };
