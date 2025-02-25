// NPM Packages
import { web3, Program, Provider } from '@coral-xyz/anchor';
import { MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

// Connection
import { sendTransactions } from './connection';

// Helpers
import {
  candyMachineProgram,
  civicPublicKey,
  getAtaForMint,
  getNetworkExpire,
  getNetworkToken,
  splAssociatedTokenAccountPublicKey,
  tokenMetadataPublicKey,
} from './helpers';

// Styles
import './index.css';

function CandyMachine(props) {
  // Helpers
  function createAssociatedTokenAccountInstruction({
    associatedTokenAddress,
    payer,
    props.walletAddress,
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
        pubkey: props.walletAddress,
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
      candyMachineProgram,
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
      await getAtaForMint(mint.publicKey, props.walletAddress.publicKey)
    )[0];

    const userPayingAccountAddress = candyMachine.state.tokenMint
      ? (await getAtaForMint(candyMachine.state.tokenMint, props.walletAddress.publicKey))[0]
      : props.walletAddress.publicKey;

    const candyMachineAddress = candyMachine.id;
    const remainingAccounts = [];
    const signers = [mint];
    const cleanupInstructions = [];
    const instructions = [
      web3.SystemProgram.createAccount({
        fromPubkey: props.walletAddress.publicKey,
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
        props.walletAddress.publicKey,
        props.walletAddress.publicKey,
      ),
      createAssociatedTokenAccountInstruction(
        userTokenAccountAddress,
        props.walletAddress.publicKey,
        props.walletAddress.publicKey,
        mint.publicKey,
      ),
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint.publicKey,
        userTokenAccountAddress,
        props.walletAddress.publicKey,
        [],
        1,
      ),
    ];

    if (candyMachine.state.gatekeeper) {
      remainingAccounts.push({
        pubkey: (
          await getNetworkToken(
            props.walletAddress.publicKey,
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

      const whitelistToken = (await getAtaForMint(mint, props.walletAddress.publicKey))[0];
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
              props.walletAddress.publicKey,
              [],
              1,
            ),
          );

          cleanupInstructions.push(
            Token.createRevokeInstruction(
              TOKEN_PROGRAM_ID,
              whitelistToken,
              props.walletAddress.publicKey,
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
          props.walletAddress.publicKey,
          [],
          candyMachine.state.price.toNumber(),
        ),
      );

      cleanupInstructions.push(
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userPayingAccountAddress,
          props.walletAddress.publicKey,
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
          mintAuthority: props.walletAddress.publicKey,
          payer: props.walletAddress.publicKey,
          recentBlockhashes: web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
          rent: web3.SYSVAR_RENT_PUBKEY,
          systemProgram: web3.SystemProgram.programId,
          tokenMetadataProgram: tokenMetadataPublicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          updateAuthority: props.walletAddress.publicKey,
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
          Mint NFT
        </button>
      </div>
    </div>
  );
}

export default CandyMachine;
