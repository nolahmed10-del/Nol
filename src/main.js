// src/main.js
// Main client logic — bundles @walletconnect/ethereum-provider and ethers via Vite

import { ethers } from 'ethers';
import EthereumProvider from '@walletconnect/ethereum-provider';

/*
 * CONFIGURATION: Replace these placeholders with your values before running:
 */
const POLYGON_CHAIN_ID_HEX = '0x89'; // Polygon mainnet
const POLYGON_CHAIN_ID_DEC = 137;
const POLYGON_RPC = 'https://polygon-rpc.com/'; // <-- REPLACE with your Polygon RPC URL
const WALLETCONNECT_PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID'; // <-- REPLACE with WalletConnect v2 project id

// Elements
const mainButton = document.getElementById('main-button');
const mainBtnText = document.getElementById('main-btn-text');
const chipModal = document.getElementById('chip-modal');
const closeModalBtn = document.getElementById('close-modal');
const modalStatus = document.getElementById('modal-status');

const metamaskChip = document.getElementById('metamask-chip');
const walletconnectChip = document.getElementById('walletconnect-chip');
const binanceChip = document.getElementById('binance-chip');

let provider = null;      // ethers provider
let rawProvider = null;   // underlying EIP-1193 provider
let signer = null;
let connectedAddress = null;
let connectedBalance = null;
let connectedWalletType = null;

function shorten(addr){ if(!addr) return ''; return addr.slice(0,6) + '…' + addr.slice(-4); }
function formatBalance(wei){ try{ const eth = ethers.utils.formatEther(wei); const num = Number(eth); return (num >= 0.01) ? num.toFixed(4) : Number(eth).toString(); }catch(e){ return '0.0000'; } }

function openModal(){ chipModal.style.display = 'flex'; chipModal.setAttribute('aria-hidden','false'); }
function closeModal(){ chipModal.style.display = 'none'; chipModal.setAttribute('aria-hidden','true'); modalStatus.style.display='none'; modalStatus.textContent=''; }

function showStatus(msg){ modalStatus.style.display = 'block'; modalStatus.textContent = msg; }
function hideStatus(){ modalStatus.style.display = 'none'; modalStatus.textContent = ''; }

function refreshMainButton(){
  if(connectedAddress){
    mainButton.innerHTML = `
      <div class="connected-chip" id="connected-chip" title="${connectedAddress}">
        <div class="address">${shorten(connectedAddress)}</div>
        <div class="balance">${connectedBalance} MATIC</div>
      </div>
    `;
    document.getElementById('connected-chip').addEventListener('click', disconnect);
  } else {
    mainButton.innerHTML = `<span class="dot" aria-hidden="true"></span><span id="main-btn-text">Connect Wallet</span>`;
  }
}

async function ensurePolygonChain(raw){
  try{
    const current = await raw.request({ method: 'eth_chainId' });
    if(current && current.toLowerCase() === POLYGON_CHAIN_ID_HEX) return;
    await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] });
  }catch(switchError){
    const code = switchError?.code;
    if(code === 4902 || (switchError && /Unrecognized chain/i.test(switchError.message || ''))){
      try{
        await raw.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: POLYGON_CHAIN_ID_HEX,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls: [POLYGON_RPC],
            blockExplorerUrls: ['https://polygonscan.com']
          }]
        });
        await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] });
      }catch(addErr){
        console.warn('Failed to add Polygon chain:', addErr);
        throw addErr;
      }
    } else {
      throw switchError;
    }
  }
}

function setupInjectedListeners(raw){
  if(!raw || !raw.on) return;
  raw.on('accountsChanged', (accounts) => {
    if(!accounts || accounts.length === 0){ disconnect(); return; }
    connectedAddress = ethers.utils.getAddress(accounts[0]);
    provider.getBalance(connectedAddress).then(b => { connectedBalance = formatBalance(b); refreshMainButton(); }).catch(()=>refreshMainButton());
  });
  raw.on('chainChanged', (chainId) => {
    if(chainId !== POLYGON_CHAIN_ID_HEX){
      showStatus('Please switch back to Polygon network in your wallet.');
    } else {
      hideStatus();
    }
  });
  raw.on('disconnect', () => {
    disconnect();
  });
}

async function connectInjected(kind){
  try{
    if(!window.ethereum){
      showStatus('No injected wallet detected. Install MetaMask or use mobile wallet browsers.');
      return;
    }
    rawProvider = window.ethereum;
    await ensurePolygonChain(rawProvider);
    const accounts = await rawProvider.request({ method: 'eth_requestAccounts' });
    if(!accounts || accounts.length === 0){
      showStatus('No accounts returned from wallet.');
      return;
    }
    const account = ethers.utils.getAddress(accounts[0]);
    provider = new ethers.providers.Web3Provider(rawProvider);
    signer = provider.getSigner();
    connectedAddress = account;
    const bal = await provider.getBalance(account);
    connectedBalance = formatBalance(bal);
    connectedWalletType = kind === 'binance' ? 'binance' : 'injected';
    setupInjectedListeners(rawProvider);
    closeModal();
    refreshMainButton();
  }catch(err){
    console.error('Injected connect error:', err);
    showStatus('Connection failed: ' + (err.message || err.toString()));
  }
}

async function connectWalletConnectV2(){
  try{
    if(!WALLETCONNECT_PROJECT_ID || WALLETCONNECT_PROJECT_ID === 'YOUR_WALLETCONNECT_PROJECT_ID'){
      showStatus('Set WALLETCONNECT_PROJECT_ID in src/main.js before connecting via WalletConnect v2.');
      return;
    }
    showStatus('Opening WalletConnect v2 QR / deep link...');

    // Initialize provider (this is bundled locally by Vite)
    const wcProvider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [POLYGON_CHAIN_ID_DEC],
      showQrModal: true,
      rpcMap: { [POLYGON_CHAIN_ID_DEC]: POLYGON_RPC },
      metadata: {
        name: document.title || 'My Project',
        description: 'Connect to Polygon via WalletConnect v2',
        url: window.location.origin,
        icons: []
      }
    });

    rawProvider = wcProvider;

    // Request accounts (this opens the modal / deep link)
    await rawProvider.request({ method: 'eth_requestAccounts' });

    provider = new ethers.providers.Web3Provider(rawProvider);
    signer = provider.getSigner();
    const accounts = await provider.listAccounts();
    if(!accounts || accounts.length === 0){
      showStatus('No accounts returned from WalletConnect.');
      return;
    }
    connectedAddress = ethers.utils.getAddress(accounts[0]);
    const bal = await provider.getBalance(connectedAddress);
    connectedBalance = formatBalance(bal);
    connectedWalletType = 'walletconnect_v2';

    // Wire events
    if(rawProvider.on){
      rawProvider.on('disconnect', () => { disconnect(); });
      rawProvider.on('accountsChanged', (accounts) => {
        if(!accounts || accounts.length === 0){ disconnect(); return; }
        connectedAddress = ethers.utils.getAddress(accounts[0]);
        provider.getBalance(connectedAddress).then(b => { connectedBalance = formatBalance(b); refreshMainButton(); }).catch(()=>refreshMainButton());
      });
      rawProvider.on('chainChanged', (chainId) => {
        if(chainId !== POLYGON_CHAIN_ID_HEX) showStatus('Please switch your wallet back to Polygon network.');
        else hideStatus();
      });
    }

    closeModal();
    refreshMainButton();
  }catch(err){
    console.error('WalletConnect v2 error', err);
    showStatus('WalletConnect failed: ' + (err?.message || err?.toString()));
  }
}

async function disconnect(){
  try{
    if(rawProvider && typeof rawProvider.disconnect === 'function'){
      try{ await rawProvider.disconnect(); }catch(e){ /* ignore */ }
    }
  }catch(e){}
  provider = null;
  rawProvider = null;
  signer = null;
  connectedAddress = null;
  connectedBalance = null;
  connectedWalletType = null;
  refreshMainButton();
  hideStatus();
}

mainButton.addEventListener('click', (e) => {
  if(connectedAddress){
    disconnect();
    return;
  }
  openModal();
});

closeModalBtn.addEventListener('click', closeModal);
chipModal.addEventListener('click', (e) => { if(e.target === chipModal) closeModal(); });

metamaskChip.addEventListener('click', async () => {
  showStatus('Connecting to injected wallet...');
  await connectInjected('metamask');
});

binanceChip.addEventListener('click', async () => {
  showStatus('Connecting to Binance Chain Wallet...');
  await connectInjected('binance');
});

walletconnectChip.addEventListener('click', async () => {
  await connectWalletConnectV2();
});

// Accessibility: ESC closes
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeModal(); });

// Init UI
refreshMainButton();
console.log('App loaded: bundled WalletConnect v2 and ethers');
