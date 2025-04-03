// NPM Packages
import { useEffect, useState } from 'react'

// Styles
import './index.css'

// Constants
const CONNECT_WALLET_BUTTON_LABEL = "Connect to Wallet";

function App() {
  // State
  const [ walletAddress, setWalletAddress ] = useState(null);
  console.log('walletAddress: ', walletAddress);

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
