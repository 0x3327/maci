---
title: Why MACI Matters
description: An overview of the purpose of MACI
sidebar_label: Purpose
sidebar_position: 2
---

# Why MACI Matters

To understand the promise of on-chain voting and the purpose of MACI, we highly recommend reading [Vitalik's post on blockchain voting](https://vitalik.eth.limo/general/2021/05/25/voting2.html). He provides an overview of the incredible potential of e-voting and why blockchains are an excellent technology to implement e-voting solutions on top of.

Below we attempt to summarize some of the points layed out in that post:

## Security requirements of a voting system

Any voting system requires some crucial security properties:

- **Correct execution**: the result (tally of votes) must be correct, and the result must be guaranteed by a transparent process (so that everyone is convinced that the result is correct)
- **Censorship resistance**: anyone eligible to vote should be able to vote, and it should not be possible to interfere with anyone's attempt to vote or to prevent anyone’s vote from being counted
- **Privacy:** you should not be able to tell which candidate someone specific voted for, or even if they voted at all
- **Coercion resistance:** you should not be able to prove to someone else how you voted, even if you want to

## Voting systems

Looking at various approaches to implement a voting system, we can see how they compare across these properties.

### In-person voting systems

In short, it's hard to know for sure how current voting systems operate. Governments and corporations spend lots of resources into ensuring their integrity, but ultimately the processes are not fully auditable so we must trust that these security properties are being enforced.

|                       | In-person |
| --------------------- | --------- |
| Correct execution     | 🤷‍♂️        |
| Censorship resistance | 🤷‍♂️        |
| Privacy               | 🤷‍♂️        |
| Collusion resistance  | 🤷‍♂️        |

### Blockchain voting systems

Blockchains provide two key properties: correct execution and censorship resistance. In terms of execution, the blockchain accepts inputs (transaction) from users, correctly processes them according to some pre-defined rules, and returns the correct output. No one is able to change the rules. Any user that wants to send a transaction, and is willing to pay a high enough fee, can send the transaction and expect to see it quickly included on-chain.

By default, however, Blockchain voting faces challenges. Ethereum, like most blockchains, is completely transparent - all transaction data is public, so there is no privacy. This makes bribery very easy as a result: someone can easily show a receipt that proves how they voted. The process may even be able to be automated via smart contracts to make collusion entirely trustless.

|                       | In-person | Ethereum |
| --------------------- | --------- | -------- |
| Correct execution     | 🤷‍♂️        | ✅       |
| Censorship resistance | 🤷‍♂️        | ✅       |
| Privacy               | 🤷‍♂️        | ❌       |
| Collusion resistance  | 🤷‍♂️        | ❌       |

### Blockchain voting systems (with ZKPs)

Enter zero-knowledge proofs (ZKPs), and voting systems like MACI. With ZK, you can have private on-chain voting but maintain public on-chain results that are verifiable by anyone.

|                       | In-person | Ethereum | Ethereum w/ ZK |
| --------------------- | --------- | -------- | -------------- |
| Correct execution     | 🤷‍♂️        | ✅       | ✅             |
| Censorship resistance | 🤷‍♂️        | ✅       | ✅             |
| Privacy               | 🤷‍♂️        | ❌       | ✅             |
| Collusion resistance  | 🤷‍♂️        | ❌       | ✅             |
