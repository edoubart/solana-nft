// NPM Packages
import { useEffect, useState } from 'react'
import { clusterApiUrl, Connection } from '@solana/web3.js';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  fetchCandyMachine,
  mplCandyMachine
} from '@metaplex-foundation/mpl-candy-machine';


// Styles
import './index.css'

// Constants
const CANDY_MACHINE_ID = import.meta.env.VITE_CANDY_MACHINE_ID
const CONNECT_WALLET_BUTTON_LABEL = "Connect to Wallet";
const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK;
const SOLANA_PREFLIGHT_COMMITMENT = 'processed';

/*
 * The Lifecycle of a Candy Machine:
 *   1. Create & Configure Candy Machine;
 *   2. Insert Items (into the Candy Machine);
 *   3. Mint (create NFTs on-demand, at mint time);
 *   4. Delete Candy Machine.
 */
function App() {
  // State
  const [ walletAddress, setWalletAddress ] = useState(null);
  console.log('walletAddress: ', walletAddress);
  const [ candyMachine, setCandyMachine ] = useState(false);
  console.log('candyMachine: ', candyMachine);

  // Hooks
  useEffect(() => {
    async function onLoad() {
      await checkIfWalletIsConnected();
    }

    //onLoad();
    window.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('load', onLoad);
    };
  }, []);

  useEffect(() => {
    async function onLoad() {
      await getCandyMachine()
    }

    onLoad();
  }, []);

  async function getCandyMachine() {
    // Solana Connection
    const network = clusterApiUrl(SOLANA_NETWORK);
    const opts = {
      preflightCommitment: SOLANA_PREFLIGHT_COMMITMENT,
    };
    const connection = new Connection(network, opts.preflightCommitment);

    // Metaplex UMI (Unified Metaplex Interface)
    const umi = createUmi(connection).use(mplCandyMachine());

    // Metaplex Candy Machine
    const candyMachinePublicKey = publicKey(CANDY_MACHINE_ID);
    const candyMachine = await fetchCandyMachine(umi, candyMachinePublicKey);

    setCandyMachine(candyMachine);
  }

  // Helpers
  async function checkIfWalletIsConnected() {
    try {
      if (window && window.solana) {
        const { solana } = window;

        if (solana && solana.isPhantom) {
          console.log("Phantom wallet found!");

          let response = await solana.connect({ onlyIfTrusted: true });

          let publicKey = response.publicKey.toString();

          console.log("Connected with Public Key: ", publicKey);

          setWalletAddress(publicKey);
        }
      }
      else {
        alert("Solana object not found! Get a Phantom Wallet!");
      }
    }
    catch (error) {
      console.log(error);
    }
  }

  // Handlers
  async function handleConnectWallet() {
    if (window && window.solana) {
      const { solana } = window;

      let response = await solana.connect();

      let publicKey = response.publicKey.toString();

      console.log("Connected with Public Key: ", publicKey);

      setWalletAddress(publicKey);
    }
  }

  // Renderers
  function renderConnectWalletButton() {
    return (
      <button onClick={handleConnectWallet}>
        { CONNECT_WALLET_BUTTON_LABEL }
      </button>
    );
  }

  return (
    <div className="App">
      { !walletAddress && renderConnectWalletButton() }
    </div>
  );
}

export default App;
