// NPM Packages
import { useEffect } from 'react';

// Styles
import './index.css';

function App() {
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

  async function checkIfWalletIsConnected() {
    try {
      const { solana } = window;

      if (solana) {
        if (solana.isPhantom) {
          console.log("Phantom wallet found!");

          let response = await solana.connect({ onlyIfTrusted: true });

          let publicKey = response.publicKey.toString();

          console.log("Connected with Public Key: ", publicKey);
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

  return (
    <div className="App">
			<div className="container">
				<div className="header-container">
					<p className="header">🍭 Candy Drop</p>
					<p className="sub-text">NFT drop machine with fair mint</p>
				</div>
				<div className="footer-container">
				</div>
			</div>
    </div>
  );
}

export default App;
