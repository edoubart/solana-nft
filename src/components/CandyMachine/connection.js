// NPM Packages
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { Transaction } from '@solana/web3.js';

// Constants
const DEFAULT_TIMEOUT = 15000;
const SOLANA_COMMITMENT_RECENT = 'recent';
const SOLANA_COMMITMENT_SINGLE = 'single';
const SOLANA_COMMITMENT_SINGLE_GOSSIP = 'singleGossip';
const SOLANA_SEQUENCE_TYPE_PARALLEL = 'Parallel';
const SOLANA_SEQUENCE_TYPE_STOP_ON_FAILURE = 'StopOnFailure';

async function awaitTransactionSignatureConfirmation({
  connection,
  commitment = SOLANA_COMMITMENT_RECENT,
  queryStatus = false,
  timeout,
  txid,
}) {
  let done = false;

  let status = {
    confirmations: 0,
    err: null,
    slot: 0,
  };

  let subId = 0;

  status = await new Promise(async (resolve, reject) => {
    setTimeout(() => {
      if (done) {
        return;
      }

      done = true;

      console.log('Rejecting for timeout...');

      reject({ timeout: true });
    }, timeout);

    try {
      subId = connection.onSignature(
        txid,
        (result, context) => {
          done = true;

          status = {
            confirmations: 0,
            err: result.err,
            slot: context.slot,
          };

          if (result.err) {
            console.log('Rejected via websocket', result.err);

            reject(status);
          }
          else {
            console.log('Resolved via websocket', result);

            resolve(status);
          }
        },
        commitment,
      );
    }
    catch (error) {
      done = true;

      console.error('WS error in setup', txid, error);
    }

    while (!done && queryStatus) {
      // eslint-disable-next-line no-loop-func
      (async () => {
        try {
          const signatureStatuses = await connection.getSignatureStatuses([
            txid,
          ]);

          status = signatureStatuses && signatureStatuses.value[0];

          if (!done) {
            if (!status) {
              console.log('REST null result for', txid, status);
            }
            else if (status.err) {
              console.log('REST error for', txid, status);

              done = true;

              reject(status.err);
            }
            else if (!status.confirmations) {
              console.log('REST no confirmations for', txid, status);
            }
            else {
              console.log('REST confirmation for', txid, status);

              done = true;

              resolve(status);
            }
          }
        }
        catch (error) {
          if (!done) {
            console.log('REST connection error: txid', txid, error);
          }
        }
      })();

      await sleep(2000);
    }
  });

  //@ts-ignore
  if (connection._signatureSubscriptions[subId]) {
    connection.removeSignatureListener(subId);
  }

  done = true;

  console.log('Returning status', status);

  return status;
}

async function getErrorForTransaction(connection, txid) {
  // wait for all confirmation before geting transaction
  await connection.confirmTransaction(txid, 'max');

  const tx = await connection.getParsedConfirmedTransaction(txid);

  const errors = [];

  if (tx?.meta && tx.meta.logMessages) {
    tx.meta.logMessages.forEach(log => {
      const regex = /Error: (.*)/gm;

      let m;

      while ((m = regex.exec(log)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }

        if (m.length > 1) {
          errors.push(m[1]);
        }
      }
    });
  }

  return errors;
};

function getUnixTs() {
  return new Date().getTime() / 1000;
};

async function sendTransaction({
  awaitConfirmation = true,
  block,
  connection,
  commitment = SOLANA_COMMITMENT_SINGLE_GOSSIP,
  includesFeePayer = false,
  instructions,
  signers,
  wallet,
}) {
  if (!wallet.publicKey) {
    throw new WalletNotConnectedError();
  }

  let transaction = new Transaction();
  instructions.forEach(instruction => transaction.add(instruction));
  transaction.recentBlockhash = (
    block || (await connection.getRecentBlockhash(commitment))
  ).blockhash;

  if (includesFeePayer) {
    transaction.setSigners(...signers.map(s => s.publicKey));
  }
  else {
    transaction.setSigners(
      // fee payed by the wallet owner
      wallet.publicKey,
      ...signers.map(s => s.publicKey),
    );
  }

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }

  if (!includesFeePayer) {
    transaction = await wallet.signTransaction(transaction);
  }

  const rawTransaction = transaction.serialize();

  let options = {
    skipPreflight: true,
    commitment,
  };

  const txid = await connection.sendRawTransaction(rawTransaction, options);

  let slot = 0;

  if (awaitConfirmation) {
    const confirmation = await awaitTransactionSignatureConfirmation({
      connection,
      commitment,
      timeout: DEFAULT_TIMEOUT,
      txid,
    });

    if (!confirmation) {
      throw new Error('Timed out awaiting confirmation on transaction');
    }

    slot = confirmation?.slot || 0;

    if (confirmation?.err) {
      const errors = await getErrorForTransaction(connection, txid);

      console.log(errors);

      throw new Error(`Raw transaction ${txid} failed`);
    }
  }

  return { txid, slot };
};

async function sendTransactionWithRetry({
  beforeSend,
  block,
  commitment = SOLANA_COMMITMENT_SINGLE_GOSSIP,
  connection,
  includesFeePayer = false,
  instructions,
  signers,
  wallet,
}) {
  if (!wallet.publicKey) {
    throw new WalletNotConnectedError();
  }

  let transaction = new Transaction();

  instructions.forEach(instruction => transaction.add(instruction));

  transaction.recentBlockhash = (
    block || (await connection.getRecentBlockhash(commitment))
  ).blockhash;

  if (includesFeePayer) {
    transaction.setSigners(...signers.map(s => s.publicKey));
  }
  else {
    transaction.setSigners(
      // fee payed by the wallet owner
      wallet.publicKey,
      ...signers.map(s => s.publicKey),
    );
  }

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }

  if (!includesFeePayer) {
    transaction = await wallet.signTransaction(transaction);
  }

  if (beforeSend) {
    beforeSend();
  }

  const { txid, slot } = await sendSignedTransaction({
    connection,
    signedTransaction: transaction,
  });

  return { txid, slot };
};

async function sendTransactions({
  block,
  commitment = SOLANA_COMMITMENT_SINGLE_GOSSIP,
  connection,
  failCallback = (txid, ind) => false,
  instructionSet,
  sequenceType = SOLANA_SEQUENCE_TYPE_PARALLEL,
  signersSet,
  successCallback = (txid, ind) => {},
  wallet,
}) {
  if (!wallet.publicKey) {
    throw new WalletNotConnectedError();
  }

  const unsignedTxns = [];

  if (!block) {
    block = await connection.getRecentBlockhash(commitment);
  }

  for (let i = 0; i < instructionSet.length; i++) {
    const instructions = instructionSet[i];
    const signers = signersSet[i];

    if (instructions.length === 0) {
      continue;
    }

    let transaction = new Transaction();

    instructions.forEach(instruction => transaction.add(instruction));

    transaction.recentBlockhash = block.blockhash;

    transaction.setSigners(
      // fee payed by the wallet owner
      wallet.publicKey,
      ...signers.map(s => s.publicKey),
    );

    if (signers.length > 0) {
      transaction.partialSign(...signers);
    }

    unsignedTxns.push(transaction);
  }

  const signedTxns = await wallet.signAllTransactions(unsignedTxns);

  const pendingTxns= [];

  let breakEarlyObject = { breakEarly: false, i: 0 };

  console.log(
    'Signed txns length',
    signedTxns.length,
    'vs handed in length',
    instructionSet.length,
  );

  for (let i = 0; i < signedTxns.length; i++) {
    const signedTxnPromise = sendSignedTransaction({
      connection,
      signedTransaction: signedTxns[i],
    });

    signedTxnPromise
      .then(({ txid, slot }) => {
        successCallback(txid, i);
      })
      .catch(reason => {
        failCallback(signedTxns[i], i);

        if (sequenceType === SOLANA_SEQUENCE_TYPE_STOP_ON_FAILURE) {
          breakEarlyObject.breakEarly = true;
          breakEarlyObject.i = i;
        }
      });

    if (sequenceType !== SOLANA_SEQUENCE_TYPE_PARALLEL) {
      try {
        await signedTxnPromise;
      }
      catch (error) {
        console.log('Caught failure', error);

        if (breakEarlyObject.breakEarly) {
          console.log('Died on ', breakEarlyObject.i);

          // Return the txn we failed on by index
          return {
            number: breakEarlyObject.i,
            txs: await Promise.all(pendingTxns),
          };
        }
      }
    }
    else {
      pendingTxns.push(signedTxnPromise);
    }
  }

  if (sequenceType !== SOLANA_SEQUENCE_TYPE_PARALLEL) {
    await Promise.all(pendingTxns);
  }

  return { number: signedTxns.length, txs: await Promise.all(pendingTxns) };
};

async function sendTransactionsWithManualRetry({
  connection,
  instructions,
  signers,
  wallet,
}) {
  let stopPoint = 0;
  let tries = 0;
  let lastInstructionsLength = null;
  let toRemoveSigners = {};

  instructions = instructions.filter((instr, i) => {
    if (instr.length > 0) {
      return true;
    } else {
      toRemoveSigners[i] = true;
      return false;
    }
  });

  let ids = [];
  let filteredSigners = signers.filter((_, i) => !toRemoveSigners[i]);

  while (stopPoint < instructions.length && tries < 3) {
    instructions = instructions.slice(stopPoint, instructions.length);
    filteredSigners = filteredSigners.slice(stopPoint, filteredSigners.length);

    if (instructions.length === lastInstructionsLength) {
      tries = tries + 1;
    }
    else {
      tries = 0;
    }

    try {
      if (instructions.length === 1) {
        const id = await sendTransactionWithRetry({
          commitment: SOLANA_COMMITMENT_SINGLE,
          connection,
          instruction: instructions[0],
          signers: filteredSigners[0],
          wallet,
        });

        ids.push(id.txid);

        stopPoint = 1;
      }
      else {
        const { txs } = await sendTransactions({
          commitment: SOLANA_COMMITMENT_SINGLE,
          connection,
          instructions,
          sequenceType: SOLANA_SEQUENCE_TYPE_STOP_ON_FAILURE,
          signers: filteredSigners,
          wallet,
        });

        ids = ids.concat(txs.map(t => t.txid));
      }
    }
    catch (error) {
      console.error(error);
    }

    console.log(
      'Died on ',
      stopPoint,
      'retrying from instruction',
      instructions[stopPoint],
      'instructions length is',
      instructions.length,
    );

    lastInstructionsLength = instructions.length;
  }

  return ids;
}

async function sendSignedTransaction({
  connection,
  signedTransaction,
  timeout = DEFAULT_TIMEOUT,
}) {
  const rawTransaction = signedTransaction.serialize();
  const startTime = getUnixTs();
  let slot = 0;
  const txid = await connection.sendRawTransaction(
    rawTransaction,
    {
      skipPreflight: true,
    },
  );

  console.log('Started awaiting confirmation for', txid);

  let done = false;
  (async () => {
    while (!done && getUnixTs() - startTime < timeout) {
      connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
      });

      await sleep(500);
    }
  })();

  try {
    const confirmation = await awaitTransactionSignatureConfirmation({
      connection,
      commitment: SOLANA_COMMITMENT_RECENT,
      queryStatus: true,
      timeout,
      txid,
    });

    if (!confirmation) {
      throw new Error('Timed out awaiting confirmation on transaction');
    }

    if (confirmation.err) {
      console.error(confirmation.err);

      throw new Error('Transaction failed: Custom instruction error');
    }

    slot = confirmation?.slot || 0;
  }
  catch (error) {
    console.error('Timeout Error caught', error);

    if (error.timeout) {
      throw new Error('Timed out awaiting confirmation on transaction');
    }

    let simulateResult = null;

    try {
      simulateResult = (
        await simulateTransaction(connection, signedTransaction, SOLANA_COMMITMENT_SINGLE)
      ).value;
    }
    catch (error) {
    }

    if (simulateResult && simulateResult.err) {
      if (simulateResult.logs) {
        for (let i = simulateResult.logs.length - 1; i >= 0; --i) {
          const line = simulateResult.logs[i];

          if (line.startsWith('Program log: ')) {
            throw new Error(
              'Transaction failed: ' + line.slice('Program log: '.length),
            );
          }
        }
      }

      throw new Error(JSON.stringify(simulateResult.err));
    }
    // throw new Error('Transaction failed');
  }
  finally {
    done = true;
  }

  console.log('Latency', txid, getUnixTs() - startTime);

  return { txid, slot };
}

async function simulateTransaction({
  connection,
  commitment,
  transaction,
}) {
  // @ts-ignore
  transaction.recentBlockhash = await connection._recentBlockhash(
    // @ts-ignore
    connection._disableBlockhashCaching,
  );

  const signData = transaction.serializeMessage();
  // @ts-ignore
  const wireTransaction = transaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString('base64');
  const config = { encoding: 'base64', commitment };
  const args = [encodedTransaction, config];

  // @ts-ignore
  const res = await connection._rpcRequest('simulateTransaction', args);

  if (res.error) {
    throw new Error('failed to simulate transaction: ' + res.error.message);
  }

  return res.result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  getErrorForTransaction,
  getUnixTs,
  sendSignedTransaction,
  sendTransaction,
  sendTransactionWithRetry,
  sendTransactions,
  sendTransactionsWithManualRetry,
  sleep,
};
