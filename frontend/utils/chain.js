import { ethers } from 'ethers';

// Network configuration (defaults to Sepolia, override via frontend/.env.local)
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111);
export const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME || 'sepolia';

let _readProvider = null;

/**
 * Direct JSON-RPC provider to the node. All contract READS go through this so they
 * are never affected by MetaMask's internal block-tracker cache.
 */
export function getReadProvider() {
  if (!_readProvider) {
    const network = new ethers.Network(CHAIN_NAME, CHAIN_ID);
    _readProvider = new ethers.JsonRpcProvider(RPC_URL, network, { staticNetwork: network });
  }
  return _readProvider;
}

/** Ensure MetaMask is on the configured chain, adding it if necessary. */
export async function ensureWalletNetwork() {
  const current = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(current, 16) === CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err) {
    // 4902 = chain unknown to wallet. Some MetaMask builds wrap it inside data.originalError.
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902) {
      throw new Error(`Could not switch MetaMask to ${CHAIN_NAME} (chainId ${CHAIN_ID}): ${err?.message || err}`);
    }
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_ID_HEX,
        chainName: CHAIN_NAME,
        rpcUrls: [RPC_URL],
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
      }],
    });
  }
}

async function isLocalDevNode(provider) {
  try {
    const client = await provider.send('web3_clientVersion', []);
    return /hardhat|anvil|ganache/i.test(String(client));
  } catch {
    return false;
  }
}

/**
 * Local dev chains (Hardhat) restart from block 0, but MetaMask keeps the highest
 * block it has ever seen in memory and ignores any lower block number. It then pins
 * eth_call / eth_estimateGas to a block that no longer exists
 * ("Received invalid block tag N"), which shows up as CALL_EXCEPTION
 * "missing revert data" and -32603 "Internal JSON-RPC error".
 *
 * This detects that condition and, ONLY on a local dev node, mines the exact number
 * of empty blocks needed so the node's height passes the wallet's cached height.
 * On live networks like Sepolia, it safely no-ops.
 */
export async function syncWalletWithNode() {
  const provider = getReadProvider();
  if (!(await isLocalDevNode(provider))) {
    return { resynced: false };
  }

  const [walletHex, nodeBlock] = await Promise.all([
    window.ethereum.request({ method: 'eth_blockNumber' }),
    provider.getBlockNumber(),
  ]);
  const walletBlock = parseInt(walletHex, 16);
  // Wallet at or behind node height = in sync (its tracker will catch up normally)
  if (walletBlock <= nodeBlock) return { resynced: false, walletBlock, nodeBlock };

  const missing = walletBlock - nodeBlock + 1;
  await provider.send('hardhat_mine', ['0x' + missing.toString(16)]);

  // Wait until MetaMask's block tracker observes the new head
  const target = walletBlock + 1;
  for (let i = 0; i < 40; i++) {
    const hex = await window.ethereum.request({ method: 'eth_blockNumber' });
    if (parseInt(hex, 16) >= target) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { resynced: true, walletBlock, nodeBlock: nodeBlock + missing };
}

/** Extract a human-readable revert reason from an ethers v6 error. */
export function decodeError(err, iface) {
  if (err?.reason) return err.reason;
  if (err?.revert?.args?.length) return String(err.revert.args[0]);

  const rpcMsg = err?.info?.error?.message || err?.error?.message || err?.message || '';
  if (/outoffunds|insufficient funds|exceeds balance/i.test(rpcMsg)) {
    return 'Insufficient ETH balance in your wallet to cover the required policy premium and transaction gas fees. Please fund your wallet or choose Tier 1 (0.01 ETH).';
  }

  const data = err?.data || err?.info?.error?.data || err?.error?.data;
  if (iface && typeof data === 'string' && data.startsWith('0x') && data.length > 10) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.join(', ')})`;
    } catch {}
    try {
      return ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + data.slice(10))[0];
    } catch {}
  }
  return err?.shortMessage || err?.info?.error?.message || err?.message || 'Unknown error';
}
