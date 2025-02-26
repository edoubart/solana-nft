// NPM Packages
import { useEffect, useState } from 'react';
import { web3, AnchorProvider, Program } from '@coral-xyz/anchor';
import { MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';

// Connection
import { sendTransactions } from './connection';

// Helpers
import {
  candyMachinePublicKey,
  civicPublicKey,
  getAtaForMint,
  getNetworkExpire,
  getNetworkToken,
  splAssociatedTokenAccountPublicKey,
  tokenMetadataPublicKey,
} from './helpers';

// Styles
import './index.css';

// Constants
const MINT_NFT_BUTTON_LABEL = "Mint NFT";
const SOLANA_NETWORK = 'devnet';
const SOLANA_PREFLIGHT_COMMITMENT = 'processed';

// Solana
const network = clusterApiUrl(SOLANA_NETWORK);
const opts = {
  preflightCommitment: SOLANA_PREFLIGHT_COMMITMENT,
};

function CandyMachine(props) {
  // State
  const [ candyMachine, setCandyMachine ] = useState(null);

  // Hooks
  useEffect(() => {
    getCandyMachineState()
  }, []);

  // Helpers
  function getProvider() {
    let connection = new Connection(network, opts.preflightCommitment);

    let provider = new AnchorProvider(
      connection,
      window.solana,
      opts.preflightCommitment,
    );

    return provider;
  }

  async function getCandyMachineState() {
    let provider = getProvider();
    console.log('provider: ', provider);

    console.log('candyMachinePublicKey: ', candyMachinePublicKey);
    let idl = await Program.fetchIdl(candyMachinePublicKey, provider);
    console.log('idl: ', idl);

    let program = new Program(idl, candyMachinePublicKey, provider);
    console.log('program: ', program);

    let candyMachine = await program.account.candyMachine
      .fetch(process.env.REACT_APP_CANDY_MACHINE_ID);

    let itemsAvailable = candyMachine.data.itemsAvailable.toNumber();
    console.log('itemsAvailable: ', itemsAvailable);

    let itemsReedeemed = candyMachine.itemsReedeemed.toNumber();
    console.log('itemsReedeemed: ', itemsReedeemed);

    let itemsRemaining = itemsAvailable - itemsReedeemed;
    console.log('itemsRemaining: ', itemsRemaining);

    let goLiveDate = candyMachine.data.goLiveDate.toNumber();
    console.log('goLiveDate: ', goLiveDate);

    let now = new Date().getTime() / 1000;
    console.log('now: ', now);

    let presale = candyMachine.data.whitelistMintSettings
      && candyMachine.data.whitelistMintSettings.presale
      && (
        !candyMachine.data.goLiveDate
        || candyMachine.data.goLiveDate.toNumber() > now
      );
    console.log('presale: ', presale);

    let goLiveDateTimeString = new Date(goLiveDate * 1000).toGMTString();
    console.log('goLiveDateTimeString: ', goLiveDateTimeString);

    setCandyMachine(candyMachine);
  }

  function createAssociatedTokenAccountInstruction({
    associatedTokenAddress,
    payer,
    walletAddress,
    splTokenMintAddress,
  }) {
    const keys = [
      {
        pubkey: payer,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: associatedTokenAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: props.data.walletAddress,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: splTokenMintAddress,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false
      },
      {
        pubkey: web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    return new web3.TransactionInstruction({
      data: Buffer.from([]),
      keys,
      programId: splAssociatedTokenAccountPublicKey,
    });
  };

  async function getCandyMachineCreator(candyMachine) {
    const candyMachineID = new PublicKey(candyMachine);

    return await web3.PublicKey.findProgramAddress(
      [ Buffer.from('candy_machine'), candyMachineID.toBuffer() ],
      candyMachinePublicKey,
    );
  };

  async function getMasterEdition(mint) {
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from('metadata'),
          tokenMetadataPublicKey.toBuffer(),
          mint.toBuffer(),
          Buffer.from('edition'),
        ],
        tokenMetadataPublicKey
      )
    )[0];
  };

  async function getMetadata(mint) {
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from('metadata'),
          tokenMetadataPublicKey.toBuffer(),
          mint.toBuffer(),
        ],
        tokenMetadataPublicKey
      )
    )[0];
  };

  // Handlers
  async function handleMintToken() {
    const mint = web3.Keypair.generate();

    const userTokenAccountAddress = (
      await getAtaForMint(mint.publicKey, props.data.walletAddress.publicKey)
    )[0];

    const userPayingAccountAddress = candyMachine.state.tokenMint
      ? (await getAtaForMint(candyMachine.state.tokenMint, props.data.walletAddress.publicKey))[0]
      : props.data.walletAddress.publicKey;

    const candyMachineAddress = candyMachine.id;
    const remainingAccounts = [];
    const signers = [mint];
    const cleanupInstructions = [];
    const instructions = [
      web3.SystemProgram.createAccount({
        fromPubkey: props.data.walletAddress.publicKey,
        lamports: await candyMachine.program.provider.connection
          .getMinimumBalanceForRentExemption(
            MintLayout.span,
          ),
        newAccountPubkey: mint.publicKey,
        programId: TOKEN_PROGRAM_ID,
        space: MintLayout.span,
      }),
      Token.createInitMintInstruction(
        TOKEN_PROGRAM_ID,
        mint.publicKey,
        0,
        props.data.walletAddress.publicKey,
        props.data.walletAddress.publicKey,
      ),
      createAssociatedTokenAccountInstruction(
        userTokenAccountAddress,
        props.data.walletAddress.publicKey,
        props.data.walletAddress.publicKey,
        mint.publicKey,
      ),
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint.publicKey,
        userTokenAccountAddress,
        props.data.walletAddress.publicKey,
        [],
        1,
      ),
    ];

    if (candyMachine.state.gatekeeper) {
      remainingAccounts.push({
        pubkey: (
          await getNetworkToken(
            props.data.walletAddress.publicKey,
            candyMachine.state.gatekeeper.gatekeeperNetwork,
          )
        )[0],
        isWritable: true,
        isSigner: false,
      });
      if (candyMachine.state.gatekeeper.expireOnUse) {
        remainingAccounts.push({
          pubkey: civicPublicKey,
          isWritable: false,
          isSigner: false,
        });
        remainingAccounts.push({
          pubkey: (
            await getNetworkExpire(
              candyMachine.state.gatekeeper.gatekeeperNetwork,
            )
          )[0],
          isWritable: false,
          isSigner: false,
        });
      }
    }

    if (candyMachine.state.whitelistMintSettings) {
      const mint = new web3.PublicKey(
        candyMachine.state.whitelistMintSettings.mint,
      );

      const whitelistToken = (await getAtaForMint(mint, props.data.walletAddress.publicKey))[0];
      remainingAccounts.push({
        pubkey: whitelistToken,
        isWritable: true,
        isSigner: false,
      });

      if (candyMachine.state.whitelistMintSettings.mode.burnEveryTime) {
        const whitelistBurnAuthority = web3.Keypair.generate();

        remainingAccounts.push({
          pubkey: mint,
          isWritable: true,
          isSigner: false,
        });

        remainingAccounts.push({
          pubkey: whitelistBurnAuthority.publicKey,
          isWritable: false,
          isSigner: true,
        });

        signers.push(whitelistBurnAuthority);

        const exists = await candyMachine.program.provider.connection
          .getAccountInfo(whitelistToken,);

        if (exists) {
          instructions.push(
            Token.createApproveInstruction(
              TOKEN_PROGRAM_ID,
              whitelistToken,
              whitelistBurnAuthority.publicKey,
              props.data.walletAddress.publicKey,
              [],
              1,
            ),
          );

          cleanupInstructions.push(
            Token.createRevokeInstruction(
              TOKEN_PROGRAM_ID,
              whitelistToken,
              props.data.walletAddress.publicKey,
              [],
            ),
          );
        }
      }
    }

    if (candyMachine.state.tokenMint) {
      const transferAuthority = web3.Keypair.generate();

      signers.push(transferAuthority);
      remainingAccounts.push({
        pubkey: userPayingAccountAddress,
        isWritable: true,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey: transferAuthority.publicKey,
        isWritable: false,
        isSigner: true,
      });

      instructions.push(
        Token.createApproveInstruction(
          TOKEN_PROGRAM_ID,
          userPayingAccountAddress,
          transferAuthority.publicKey,
          props.data.walletAddress.publicKey,
          [],
          candyMachine.state.price.toNumber(),
        ),
      );

      cleanupInstructions.push(
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userPayingAccountAddress,
          props.data.walletAddress.publicKey,
          [],
        ),
      );
    }

    const metadataAddress = await getMetadata(mint.publicKey);

    const masterEdition = await getMasterEdition(mint.publicKey);

    const [ candyMachineCreator, creatorBump ] = await getCandyMachineCreator(
      candyMachineAddress,
    );

    instructions.push(
      await candyMachine.program.instruction.mintNft(creatorBump, {
        accounts: {
          candyMachine: candyMachineAddress,
          candyMachineCreator,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
          instructionSysvarAccount: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          masterEdition,
          metadata: metadataAddress,
          mint: mint.publicKey,
          mintAuthority: props.data.walletAddress.publicKey,
          payer: props.data.walletAddress.publicKey,
          recentBlockhashes: web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
          rent: web3.SYSVAR_RENT_PUBKEY,
          systemProgram: web3.SystemProgram.programId,
          tokenMetadataProgram: tokenMetadataPublicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          updateAuthority: props.data.walletAddress.publicKey,
          wallet: candyMachine.state.treasury,
        },
        remainingAccounts:
        remainingAccounts.length > 0 ? remainingAccounts : undefined,
      }),
    );

    try {
      return (
        await sendTransactions({
          connection: candyMachine.program.provider.connection,
          instructions: [ instructions, cleanupInstructions ],
          signers: [ signers, [] ],
          wallet: candyMachine.program.provider.wallet,
        })
      ).txs.map(t => t.txid);
    }
    catch (error) {
      console.log(error);
    }

    return [];
  };

  return (
    <div className="CandyMachine">
      <div className="machine-container">
        <p>Drop Date:</p>
        <p>Items Minted:</p>
        <button className="cta-button mint-button" onClick={handleMintToken}>
          { MINT_NFT_BUTTON_LABEL }
        </button>
      </div>
    </div>
  );
}

export default CandyMachine;
