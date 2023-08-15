/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require('hardhat-contract-sizer');
require('@nomiclabs/hardhat-ethers');
require('hardhat-artifactor');

module.exports = {
	solidity: {
		version: '0.8.10',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		localhost: {
			timeout: 400000000
		  },
		hardhat: {
			accounts: {
				mnemonic:
					'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat',
			},
			loggingEnabled: true,
			allowUnlimitedContractSize: true,
			throwOnTransactionFailures: true,
			throwOnCallFailures: true,
			blockGasLimit: 25000000,
			timeout: 400000000
		},
	},
	contractSizer: {
		alphaSort: true,
		runOnCompile: true,
		disambiguatePaths: false,
	},
	mocha: {
		timeout: 400000000
		},
};
