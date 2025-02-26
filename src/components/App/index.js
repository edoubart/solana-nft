// NPM Packages
import { useEffect, useState } from 'react';

// Styles
import './index.css';

// Constants
const APP_NAME = "🍭 Candy Drop";
const APP_DESCRIPTION = "NFT drop machine with fair mint";
const CONNECT_WALLET_BUTTON_LABEL = "Connect to Wallet";

function App() {
  // State
  const [ walletAddress, setWalletAddress ] = useState(null);

  // Hooks
  useEffect(() => {
    async function onLoad() {
      await checkIfWalletIsConnected();
    }

    window.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('load', onLoad);
    };
  }, []);

  // Helpers
  async function checkIfWalletIsConnected() {
    try {
      if (window && window.solana) {
        if (window.solana && window.solana.isPhantom) {
          console.log("Phantom wallet found!");

          let response = await window.solana.connect({ onlyIfTrusted: true });

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
      console.error(error);
    }
  }

  // Handlers
  async function handleConnectWallet() {
    if (window && window.solana) {
      let response = await window.solana.connect();

      let publicKey = response.publicKey.toString();

      console.log("Connected with Public Key: ", publicKey);

      setWalletAddress(publicKey);
    }
  }

  // Renderers
  function renderConnectWalletButton() {
    return (
      <button
      className="cta-button connect-wallet-button"
      onClick={handleConnectWallet}
      >
        { CONNECT_WALLET_BUTTON_LABEL }
      </button>
    );
  }

  return (
    <div className="App">
			<div className="container">
				<div className="header-container">
					<p className="header">{ APP_NAME }</p>
					<p className="sub-text">{ APP_DESCRIPTION }</p>
          { !walletAddress && renderConnectWalletButton() }
				</div>
				<div className="footer-container">
				</div>
			</div>
    </div>
  );
}

export default App;
