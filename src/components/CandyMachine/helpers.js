// NPM Packages
import { web3 } from '@coral-xyz/anchor';
import * as anchor from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';
import {
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';

// Constants
const CANDY_MACHINE_PROGRAM_ID = 'cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ';
const CIVIC_PROGRAM_ID = 'gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs';
const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const TOKEN_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

// Public Keys
const candyMachinePublicKey = new web3.PublicKey(CANDY_MACHINE_PROGRAM_ID);
const civicPublicKey = new anchor.web3.PublicKey(CIVIC_PROGRAM_ID);
const splAssociatedTokenAccountPublicKey = new web3.PublicKey(
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
);
const tokenMetadataPublicKey = new web3.PublicKey(TOKEN_METADATA_PROGRAM_ID);

function createAssociatedTokenAccountInstruction({
  associatedTokenAddress,
  payer,
  splTokenMintAddress,
  walletAddress,
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
      pubkey: walletAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: splTokenMintAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: tokenMetadataPublicKey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    data: Buffer.from([]),
    keys,
    programId: splAssociatedTokenAccountPublicKey,
  });
}

function toDate(value) {
  if (!value) {
    return;
  }

  return new Date(value.toNumber() * 1000);
};

const numberFormater = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatNumber = {
  format: (val) => {
    if (!val) {
      return '--';
    }

    return numberFormater.format(val);
  },
  asNumber: (val) => {
    if (!val) {
      return undefined;
    }

    return val.toNumber() / LAMPORTS_PER_SOL;
  },
};

async function getAtaForMint(mint, buyer) {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      buyer.toBuffer(),
      tokenMetadataPublicKey.toBuffer(),
      mint.toBuffer(),
    ],
    splAssociatedTokenAccountPublicKey,
  );
};

async function getNetworkExpire(gatekeeperNetwork) {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      gatekeeperNetwork.toBuffer(),
      Buffer.from('expire'),
    ],
    civicPublicKey,
  );
};

async function getNetworkToken(wallet, gatekeeperNetwork) {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      wallet.toBuffer(),
      Buffer.from('gateway'),
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]),
      gatekeeperNetwork.toBuffer(),
    ],
    civicPublicKey,
  );
};

export {
  candyMachinePublicKey,
  civicPublicKey,
  createAssociatedTokenAccountInstruction,
  formatNumber,
  getAtaForMint,
  getNetworkExpire,
  getNetworkToken,
  splAssociatedTokenAccountPublicKey,
  toDate,
  tokenMetadataPublicKey,
};
