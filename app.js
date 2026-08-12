/**
 * APP.JS - PEMBAYARAN QRIS DANA (DANA PAYMENT GATEWAY & ADMIN LOCK)
 * Fitur: Dynamic EMVCo QRIS Real-Time, CRC16 Checksum, Admin PIN Lock, LocalStorage, Rekap Table & CSV Export
 */

// QRCode is loaded globally in index.html to keep the page working when opened directly in a browser.

// Global Error Handler for Mobile Stability
window.addEventListener('error', (event) => {
  console.warn('Handling mobile JS error safely:', event.message || event);
});

window.addEventListener('unhandledrejection', (event) => {
  console.warn('Handling mobile Promise rejection safely:', event.reason);
});

// Memory Store Fallback for Private Browsing / Storage Quota Limit
const memoryStore = new Map();

function safeGetItem(key) {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
  } catch (e) {
    // LocalStorage restricted or throwing error in private mode
  }
  return memoryStore.get(key) || null;
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // QuotaExceeded or Private Mode restriction
  }
  memoryStore.set(key, value);
}

// Key LocalStorage
const STORAGE_KEY = 'qris_dana_transactions';
const ADMIN_PIN_KEY = 'qris_admin_pin';
const CONFIG_KEY = 'qris_merchant_config';

// Default Configs
const DEFAULT_PIN = '1234';
const DEFAULT_MERCHANT_CONFIG = {
  merchantName: 'PEMBAYARAN DANA STORE',
  nmid: 'ID1020268841902',
  city: 'JAKARTA',
  mcc: '5812',
  qrisMode: 'dynamic',
  qrisBase: '00020101021126680016ID.DANA.WWW01189360091100202688419020303UMI51440014ID.CO.QRIS.WWW0215ID10202688419020303UMI520458125303360'
};

// Indonesian Month Names
const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Active State
let activeTransaction = null;
let currentQRISPayload = '';
let pendingAdminAction = null;
let isAdminUnlocked = false;

try {
  isAdminUnlocked = sessionStorage.getItem('qris_admin_unlocked') === 'true';
} catch (e) {
  isAdminUnlocked = false;
}

// Initial Seed Data
const SEED_TRANSACTIONS = [
  {
    id: 'TRX-948102',
    name: 'Ahmad',
    amount: 50000,
    date: '11 Agustus 2026',
    time: '22:30',
    status: 'Pembayaran Berhasil'
  },
  {
    id: 'TRX-948101',
    name: 'Siti Rahma',
    amount: 100000,
    date: '11 Agustus 2026',
    time: '19:15',
    status: 'Pembayaran Berhasil'
  },
  {
    id: 'TRX-948100',
    name: 'Budi Santoso',
    amount: 25000,
    date: '10 Agustus 2026',
    time: '14:45',
    status: 'Pembayaran Berhasil'
  }
];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  updateMerchantUI();
  updateAdminBadgeUI();
  setupEventListeners();
  renderHistoryTable();
});

// Setup Initial Storage Data
function initStorage() {
  if (!safeGetItem(STORAGE_KEY)) {
    safeSetItem(STORAGE_KEY, JSON.stringify(SEED_TRANSACTIONS));
  }
  if (!safeGetItem(ADMIN_PIN_KEY)) {
    safeSetItem(ADMIN_PIN_KEY, DEFAULT_PIN);
  }
  if (!safeGetItem(CONFIG_KEY)) {
    safeSetItem(CONFIG_KEY, JSON.stringify(DEFAULT_MERCHANT_CONFIG));
  }
}

// Get Merchant Config
function getMerchantConfig() {
  try {
    const raw = safeGetItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_MERCHANT_CONFIG, ...JSON.parse(raw) } : DEFAULT_MERCHANT_CONFIG;
  } catch (err) {
    return DEFAULT_MERCHANT_CONFIG;
  }
}

// Save Merchant Config
function saveMerchantConfig(cfg) {
  try {
    safeSetItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.error('Gagal menyimpan config:', err);
  }
}

// Get PIN
function getAdminPIN() {
  return safeGetItem(ADMIN_PIN_KEY) || DEFAULT_PIN;
}

// Get All Transactions
function getTransactions() {
  try {
    const data = safeGetItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Gagal membaca data dari storage:', err);
    return [];
  }
}

// Save Transactions
function saveTransactions(dataList) {
  try {
    safeSetItem(STORAGE_KEY, JSON.stringify(dataList));
  } catch (err) {
    console.error('Gagal menyimpan ke storage:', err);
  }
}

// Attach Event Listeners
function setupEventListeners() {
  // Lanjutkan Pembayaran
  const btnContinue = document.getElementById('btn-continue');
  if (btnContinue) btnContinue.addEventListener('click', handleFormSubmit);

  // Kembali / Ubah Data
  const btnBack = document.getElementById('btn-back');
  if (btnBack) btnBack.addEventListener('click', () => switchPage(1));

  // Pembayaran Baru
  const btnNewPayment = document.getElementById('btn-new-payment');
  if (btnNewPayment) btnNewPayment.addEventListener('click', resetPaymentForm);

  // Ekspor Excel & CSV
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', exportToExcel);

  const btnExportCSV = document.getElementById('btn-export-csv');
  if (btnExportCSV) btnExportCSV.addEventListener('click', exportToCSV);

  // Clear History (Reset) - Protected
  const btnClear = document.getElementById('btn-clear-history');
  if (btnClear) btnClear.addEventListener('click', handleProtectedClearHistory);

  // Header Admin Access Button
  const btnAdminAccess = document.getElementById('btn-admin-access');
  if (btnAdminAccess) btnAdminAccess.addEventListener('click', handleAdminAccessClick);

  // Copy QRIS Payload
  const btnCopy = document.getElementById('btn-copy-qris');
  if (btnCopy) btnCopy.addEventListener('click', copyQRISPayload);

  // Download QRIS Image
  const btnDownload = document.getElementById('btn-download-qris');
  if (btnDownload) btnDownload.addEventListener('click', downloadQRISImage);

  // Modal Admin PIN Events
  const btnSubmitPin = document.getElementById('btn-submit-pin');
  if (btnSubmitPin) btnSubmitPin.addEventListener('click', verifyAdminPin);

  const btnCancelPin = document.getElementById('btn-cancel-pin');
  if (btnCancelPin) btnCancelPin.addEventListener('click', closeAdminPinModal);

  const btnXClosePin = document.getElementById('btn-x-close-pin');
  if (btnXClosePin) btnXClosePin.addEventListener('click', closeAdminPinModal);

  const modalPin = document.getElementById('modal-admin-pin');
  if (modalPin) {
    modalPin.addEventListener('click', (e) => {
      if (e.target === modalPin) closeAdminPinModal();
    });
  }

  const pinInput = document.getElementById('admin-pin-input');
  if (pinInput) {
    pinInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') verifyAdminPin();
    });
  }

  // Modal Settings Events
  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveMerchantSettingsFromModal);

  const btnCloseSettings = document.getElementById('btn-close-settings');
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeMerchantSettingsModal);

  const btnXCloseSettings = document.getElementById('btn-x-close-settings');
  if (btnXCloseSettings) btnXCloseSettings.addEventListener('click', closeMerchantSettingsModal);

  const modalSettings = document.getElementById('modal-merchant-settings');
  if (modalSettings) {
    modalSettings.addEventListener('click', (e) => {
      if (e.target === modalSettings) closeMerchantSettingsModal();
    });
  }

  const btnResetBase = document.getElementById('btn-reset-qris-base');
  if (btnResetBase) {
    btnResetBase.addEventListener('click', () => {
      const elBase = document.getElementById('cfg-qris-base');
      if (elBase) {
        elBase.value = DEFAULT_MERCHANT_CONFIG.qrisBase;
        updateQRISValidationStatus();
        showToast('Payload QRIS berhasil dikembalikan ke DANA Bawaan.', 'info');
      }
    });
  }

  const elBaseInput = document.getElementById('cfg-qris-base');
  if (elBaseInput) {
    elBaseInput.addEventListener('input', updateQRISValidationStatus);
  }
}

/* ==========================================================================
   CRC16 CCITT (0xFFFF) Checksum Calculator according to EMVCo / QRIS ISO 13239
   ========================================================================== */
function calcCRC16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/* ==========================================================================
   EMVCo QRIS TLV (Type-Length-Value) Parser & Rebuilder
   ========================================================================== */
function parseEMVCoPayload(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { isValid: false, tags: new Map(), cleanPayload: '' };
  }
  let str = rawInput.trim();
  // Strip trailing CRC tag 6304XXXX if present
  str = str.replace(/6304[0-9A-Fa-f]{4}$/, '');
  if (str.endsWith('6304')) {
    str = str.substring(0, str.length - 4);
  }

  const tags = new Map();
  let pos = 0;
  let isValid = true;

  while (pos + 4 <= str.length) {
    const tag = str.substring(pos, pos + 2);
    const lenVal = str.substring(pos + 2, pos + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenVal)) {
      isValid = false;
      break;
    }
    const len = parseInt(lenVal, 10);
    if (pos + 4 + len > str.length) {
      isValid = false;
      break;
    }
    const val = str.substring(pos + 4, pos + 4 + len);
    tags.set(tag, val);
    pos += 4 + len;
  }

  if (!tags.has('00')) {
    isValid = false;
  }

  return { isValid, tags, cleanPayload: str };
}

function buildGenuineQRISPayload(config, amount, txId) {
  let baseInput = (config.qrisBase || '').trim();
  if (!baseInput) {
    baseInput = DEFAULT_MERCHANT_CONFIG.qrisBase;
  }

  const mode = config.qrisMode || 'dynamic';
  let { isValid, tags } = parseEMVCoPayload(baseInput);

  // Fallback if payload string is completely corrupt or empty
  if (!isValid || tags.size === 0) {
    const fallback = parseEMVCoPayload(DEFAULT_MERCHANT_CONFIG.qrisBase);
    tags = fallback.tags;
  }

  if (!tags.has('00')) tags.set('00', '01');

  if (mode === 'static') {
    // Mode Statis: keep tag 01 as 11 (Static), do not inject tag 54 (amount)
    if (!tags.has('01')) tags.set('01', '11');
    tags.delete('54'); // remove amount tag if present in static mode
  } else {
    // Mode Dinamis: force tag 01 to 12 (Dynamic) & inject tag 54
    tags.set('01', '12');
    const amtStr = Math.round(amount || 0).toString();
    tags.set('54', amtStr);
  }

  if (!tags.has('52')) tags.set('52', config.mcc || '5812');
  if (!tags.has('53')) tags.set('53', '360');
  if (!tags.has('58')) tags.set('58', 'ID');

  if (config.merchantName && config.merchantName.trim()) {
    const mName = config.merchantName.trim().toUpperCase().slice(0, 25);
    tags.set('59', mName);
  } else if (!tags.has('59')) {
    tags.set('59', 'PEMBAYARAN DANA STORE');
  }

  if (config.city && config.city.trim()) {
    const mCity = config.city.trim().toUpperCase().slice(0, 15);
    tags.set('60', mCity);
  } else if (!tags.has('60')) {
    tags.set('60', 'JAKARTA');
  }

  if (txId) {
    const refVal = txId.substring(0, 20);
    const sub07 = '07' + refVal.length.toString().padStart(2, '0') + refVal;
    tags.set('62', sub07);
  }

  // Sort tags numerically (00, 01, 26, 51, 52, 53, 54, 58, 59, 60, 62)
  const sortedTags = Array.from(tags.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  let assembled = '';
  for (const tag of sortedTags) {
    const val = tags.get(tag);
    const lenStr = val.length.toString().padStart(2, '0');
    assembled += `${tag}${lenStr}${val}`;
  }

  const payloadToSign = assembled + '6304';
  const crc = calcCRC16(payloadToSign);
  return payloadToSign + crc;
}

// Live Validation Status Helper in Settings Modal
function updateQRISValidationStatus() {
  const elBase = document.getElementById('cfg-qris-base');
  const statusEl = document.getElementById('qris-validation-status');
  if (!elBase || !statusEl) return;

  const raw = elBase.value.trim();
  if (!raw) {
    statusEl.style.background = '#fef2f2';
    statusEl.style.color = '#991b1b';
    statusEl.style.borderColor = '#fca5a5';
    statusEl.innerHTML = '⚠️ <b>String QRIS Kosong.</b> Akan menggunakan string DANA Bawaan saat disimpan.';
    return;
  }

  const { isValid, tags } = parseEMVCoPayload(raw);
  if (isValid) {
    const detectedName = tags.get('59') || 'Merchant';
    const detectedCity = tags.get('60') || 'Kota';
    statusEl.style.background = '#f0fdf4';
    statusEl.style.color = '#166534';
    statusEl.style.borderColor = '#86efac';
    statusEl.innerHTML = `✅ <b>Format EMVCo QRIS Valid!</b><br>Detected Merchant: <b>${escapeHtml(detectedName)}</b> (${escapeHtml(detectedCity)}) | Total Tag: ${tags.size}`;
  } else {
    statusEl.style.background = '#fffbebe';
    statusEl.style.color = '#92400e';
    statusEl.style.borderColor = '#fde68a';
    statusEl.innerHTML = `⚠️ <b>String QRIS Kustom Tidak Standar EMVCo.</b><br>Sistem akan melengkapi Tag EMVCo & menghitung ulang CRC16 resmi DANA secara otomatis.`;
  }
}

// Set Preset Amount Handler
window.setPresetAmount = function(amount) {
  const amountInput = document.getElementById('payment-amount');
  if (amountInput) {
    amountInput.value = amount;
    amountInput.classList.remove('is-invalid');
    const errEl = document.getElementById('amount-error');
    if (errEl) errEl.classList.remove('show');
  }

  const presets = document.querySelectorAll('.btn-preset');
  presets.forEach(btn => {
    const val = parseInt(btn.textContent.replace(/[^0-9]/g, ''), 10);
    if (val === amount) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

// Form Validation and Step 1 -> Step 2
async function handleFormSubmit() {
  const nameInput = document.getElementById('payer-name');
  const amountInput = document.getElementById('payment-amount');
  const nameError = document.getElementById('name-error');
  const amountError = document.getElementById('amount-error');

  const nameVal = nameInput ? nameInput.value.trim() : '';
  const amountVal = amountInput ? parseFloat(amountInput.value) : 0;

  let isValid = true;

  if (!nameVal) {
    nameInput.classList.add('is-invalid');
    nameError.classList.add('show');
    isValid = false;
  } else {
    nameInput.classList.remove('is-invalid');
    nameError.classList.remove('show');
  }

  if (isNaN(amountVal) || amountVal <= 0) {
    amountInput.classList.add('is-invalid');
    amountError.classList.add('show');
    isValid = false;
  } else {
    amountInput.classList.remove('is-invalid');
    amountError.classList.remove('show');
  }

  if (!isValid) return;

  const txId = 'TRX-' + Math.floor(100000 + Math.random() * 900000);
  const now = new Date();

  activeTransaction = {
    id: txId,
    name: nameVal,
    amount: amountVal,
    date: formatDateIndonesian(now),
    time: formatTimeIndonesian(now),
    status: 'Menunggu Pembayaran'
  };

  try {
    if (window.__QRIS_PAYMENT_API__ && window.__QRIS_PAYMENT_API__.enabled) {
      await registerPaymentToBackend(activeTransaction);
    }
  } catch (error) {
    console.warn('Backend QRIS tidak bisa diakses, transaksi tetap ditampilkan untuk polling lokal.', error);
  }

  document.getElementById('summary-payer-name').textContent = activeTransaction.name;
  document.getElementById('summary-tx-id').textContent = activeTransaction.id;
  document.getElementById('summary-amount-display').textContent = formatCurrency(activeTransaction.amount);

  generateQRISCode(activeTransaction);

  switchPage(2);
  showToast('Kode QRIS DANA Asli berhasil dibuat. Silakan pindai via DANA.', 'info');
}

// Generate Genuine QRIS Canvas
async function loadScript(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      const t = setTimeout(() => {
        s.onerror = null;
        s.onload = null;
        reject(new Error('Timeout loading ' + url));
      }, timeout);
      s.onload = () => { clearTimeout(t); resolve(); };
      s.onerror = (e) => { clearTimeout(t); reject(e || new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    } catch (e) {
      reject(e);
    }
  });
}

async function ensureQrLib() {
  if (typeof window === 'undefined') return false;
  if (window.QRCode && typeof window.QRCode.toCanvas === 'function') return true;

  const candidates = [
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js',
    'https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js'
  ];

  for (const url of candidates) {
    try {
      await loadScript(url, 6000);
      if (window.QRCode && typeof window.QRCode.toCanvas === 'function') return true;
    } catch (e) {
      console.warn('QR lib load failed for', url, e && e.message);
    }
  }

  return false;
}

async function generateQRISCode(tx) {
  const canvasEl = document.getElementById('qris-canvas');
  const imgFallback = document.getElementById('qris-image');
  const payloadEl = document.getElementById('qris-payload-display');

  const config = getMerchantConfig();
  currentQRISPayload = buildGenuineQRISPayload(config, tx.amount, tx.id);

  if (payloadEl) payloadEl.textContent = currentQRISPayload;

  // Ensure QR library is available (attempt to load if missing)
  const libReady = await ensureQrLib();

  try {
    if (canvasEl && libReady) {
      const qrcodeLib = typeof window !== 'undefined' ? window.QRCode : null;
      if (!qrcodeLib || typeof qrcodeLib.toCanvas !== 'function') {
        throw new Error('QR library unavailable after loading attempts');
      }

      canvasEl.classList.remove('hidden');
      if (imgFallback) imgFallback.classList.add('hidden');

      // Use a microtask to avoid blocking UI
      await new Promise((resolve) => setTimeout(resolve, 0));

      await qrcodeLib.toCanvas(canvasEl, currentQRISPayload, {
        width: 240,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'M'
      });
      return;
    }

    // If lib not ready or canvas missing, use fallback image
    throw new Error('Canvas QR not used; falling back to image');
  } catch (err) {
    console.warn('Gagal membuat canvas QR Code (falling back to image):', err && err.message);
    if (imgFallback && canvasEl) {
      canvasEl.classList.add('hidden');
      imgFallback.classList.remove('hidden');
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(currentQRISPayload)}&color=000000&bgcolor=ffffff&margin=2`;
      imgFallback.src = qrApiUrl;
    }
  }
}
      imgFallback.src = qrApiUrl;
    }
  }
}


// Copy QRIS String
function copyQRISPayload() {
  if (!currentQRISPayload) {
    showToast('Tidak ada payload QRIS untuk disalin.', 'error');
    return;
  }

  const handleFallbackCopy = () => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = currentQRISPayload;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        showToast('Payload QRIS EMVCo berhasil disalin!', 'success');
      } else {
        showToast('Gagal menyalin. Silakan salin manual.', 'error');
      }
    } catch (e) {
      showToast('Gagal menyalin teks.', 'error');
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentQRISPayload).then(() => {
      showToast('Payload QRIS EMVCo berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      handleFallbackCopy();
    });
  } else {
    handleFallbackCopy();
  }
}

// Download QRIS Canvas Card Image
function downloadQRISImage() {
  const canvasEl = document.getElementById('qris-canvas');
  const imgFallback = document.getElementById('qris-image');
  const txId = activeTransaction ? activeTransaction.id : 'CARD';
  const filename = `QRIS_DANA_${txId}.png`;

  try {
    // If the canvas is visible and contains the QR, export a high-DPI image with white background
    if (canvasEl && !canvasEl.classList.contains('hidden')) {
      const width = canvasEl.width || 240;
      const height = canvasEl.height || 240;
      const ratio = window.devicePixelRatio || 1;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.round(width * ratio);
      tempCanvas.height = Math.round(height * ratio);
      tempCanvas.style.width = `${width}px`;
      tempCanvas.style.height = `${height}px`;
      const ctx = tempCanvas.getContext('2d');

      // Fill white background to avoid transparency rendering as dark in some viewers
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Draw the original canvas onto the high-DPI canvas
      ctx.drawImage(canvasEl, 0, 0, tempCanvas.width, tempCanvas.height);

      const dataUrl = tempCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Gambar QRIS berhasil diunduh!', 'success');
      return;
    }

    // If canvas is not available but fallback image is shown, try to fetch and download it
    if (imgFallback && !imgFallback.classList.contains('hidden') && imgFallback.src) {
      fetch(imgFallback.src, { mode: 'cors' }).then(res => res.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Gambar QRIS berhasil diunduh!', 'success');
      }).catch(err => {
        // If CORS prevents download, open in new tab as fallback
        console.warn('Fetch fallback image failed, opening in new tab:', err);
        window.open(imgFallback.src, '_blank');
        showToast('Tidak bisa mengunduh langsung karena kebijakan CORS; gambar dibuka di tab baru.', 'info');
      });
      return;
    }

    showToast('Tidak ada gambar QRIS untuk diunduh.', 'error');
  } catch (err) {
    console.error('Gagal mengunduh gambar QRIS:', err);
    showToast('Gagal mengunduh gambar QRIS.', 'error');
  }
}

// Payment Completion Trigger
function handlePaymentCompleted() {
  if (!activeTransaction) {
    showToast('Tidak ada transaksi aktif.', 'error');
    return;
  }

  activeTransaction.status = 'Pembayaran Berhasil';

  const list = getTransactions();
  list.unshift(activeTransaction);
  saveTransactions(list);

  document.getElementById('receipt-name').textContent = activeTransaction.name;
  document.getElementById('receipt-amount').textContent = formatCurrency(activeTransaction.amount);
  document.getElementById('receipt-date').textContent = activeTransaction.date;
  document.getElementById('receipt-time').textContent = activeTransaction.time;

  renderHistoryTable();
  switchPage(3);

  showToast(`Pembayaran sebesar ${formatCurrency(activeTransaction.amount)} dari ${activeTransaction.name} berhasil!`, 'success');
}

let scanCheckInterval = null;

window.__QRIS_PAYMENT_API__ = window.__QRIS_PAYMENT_API__ || {
  enabled: true,
  statusUrl: '/api/qris/status',
  createUrl: '/api/qris/create',
  webhookUrl: '/api/qris/webhook',
  message: 'Backend QRIS DANA sedang aktif dan akan memvalidasi pembayaran sebelum lanjut.'
};
window.__QRIS_PAYMENT_STATUS__ = window.__QRIS_PAYMENT_STATUS__ || {};

function resolvePaymentStatusValue(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  const isPaid = ['PAID', 'SUCCESS', 'SUCCESSFUL', 'SETTLED', 'COMPLETED', 'CONFIRMED', 'PAID_CONFIRMED'];
  const isPending = ['PENDING', 'WAITING', 'PROCESSING', 'INITIATED', 'UNPAID', 'NOT_PAID'];

  if (isPaid.includes(normalized)) return 'Pembayaran Berhasil';
  if (isPending.includes(normalized)) return 'Menunggu Pembayaran';
  if (normalized === 'FAILED' || normalized === 'REJECTED') return 'Gagal';
  return null;
}

function getPaymentStatusUrl(txId) {
  const config = window.__QRIS_PAYMENT_API__ || {};
  if (!config.enabled || !txId) return null;

  if (typeof config.statusUrl === 'string' && config.statusUrl.trim()) {
    return config.statusUrl.replace(':txId', encodeURIComponent(txId)).replace('{txId}', encodeURIComponent(txId));
  }

  return `/api/qris/status/${encodeURIComponent(txId)}`;
}

async function registerPaymentToBackend(tx) {
  const config = window.__QRIS_PAYMENT_API__ || {};
  if (!config.enabled) return false;

  const endpoint = config.createUrl || '/api/qris/create';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txId: tx.id,
      amount: tx.amount,
      customerName: tx.name,
      status: 'PENDING'
    })
  });

  if (!response.ok) {
    throw new Error('Gagal mendaftarkan transaksi ke backend');
  }

  const data = await response.json();
  if (data && data.txId) {
    activeTransaction.backendStatus = data.status || 'PENDING';
  }

  return true;
}

async function pollPaymentStatus() {
  if (!activeTransaction) return false;
  if (!window.__QRIS_PAYMENT_API__ || !window.__QRIS_PAYMENT_API__.enabled) return false;

  const txId = String(activeTransaction.id || '');
  if (!txId) return false;

  const localStatus = window.__QRIS_PAYMENT_STATUS__ && window.__QRIS_PAYMENT_STATUS__[txId];
  if (localStatus) {
    const mapped = resolvePaymentStatusValue(localStatus);
    if (mapped === 'Pembayaran Berhasil') return true;
    return false;
  }

  const statusUrl = getPaymentStatusUrl(txId);
  if (!statusUrl) return false;

  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const payloadValue = typeof data === 'string' ? data : (data.status || data.state || data.paymentStatus || data.data?.status || data.data?.state);
    const mapped = resolvePaymentStatusValue(payloadValue);
    return mapped === 'Pembayaran Berhasil';
  } catch (error) {
    return false;
  }
}

window.setQrPaymentStatus = function(txId, status) {
  if (!txId) return;
  if (!window.__QRIS_PAYMENT_API__ || !window.__QRIS_PAYMENT_API__.enabled) {
    console.warn('Auto-confirm pembayaran diblokir karena backend QRIS DANA belum aktif.');
    return;
  }

  window.__QRIS_PAYMENT_STATUS__ = window.__QRIS_PAYMENT_STATUS__ || {};
  window.__QRIS_PAYMENT_STATUS__[String(txId)] = status;

  if (resolvePaymentStatusValue(status) === 'Pembayaran Berhasil' && activeTransaction && String(activeTransaction.id) === String(txId)) {
    triggerScanCompleted('✅ Konfirmasi pembayaran dari gateway diterima. Pembayaran berhasil!');
  }
};

// Start Monitoring when entering Step 2
function startScanMonitoring() {
  stopScanMonitoring();

  const titleEl = document.getElementById('scan-status-title');
  const descEl = document.getElementById('scan-status-desc');

  if (titleEl) titleEl.innerHTML = '⏳ Menunggu konfirmasi pembayaran dari DANA...';
  if (descEl) {
    descEl.innerHTML = 'Sistem hanya akan melanjutkan ke tahap selesai setelah status pembayaran benar-benar dikonfirmasi oleh backend/gateway QRIS DANA.';
  }

  if (!window.__QRIS_PAYMENT_API__ || !window.__QRIS_PAYMENT_API__.enabled) {
    if (descEl) {
      descEl.innerHTML = 'Backend QRIS DANA belum aktif. Transaksi tidak akan otomatis selesai tanpa konfirmasi pembayaran yang valid dari server.';
    }
    return;
  }

  scanCheckInterval = setInterval(async () => {
    if (!activeTransaction) {
      stopScanMonitoring();
      return;
    }

    const paid = await pollPaymentStatus();
    if (paid) {
      stopScanMonitoring();
      triggerScanCompleted('✅ Transfer masuk terdeteksi dan dikonfirmasi oleh gateway DANA.');
    }
  }, 4000);
}

// Trigger Scan Completion & Transition to Step 3
function triggerScanCompleted(toastMsg) {
  if (!activeTransaction) return;
  if (activeTransaction.status === 'Pembayaran Berhasil') {
    stopScanMonitoring();
    return;
  }

  stopScanMonitoring();

  const titleEl = document.getElementById('scan-status-title');
  if (titleEl) titleEl.innerHTML = '✅ QRIS Berhasil Dibayar!';

  showToast(toastMsg || '✅ Pembayaran QRIS DANA Berhasil!', 'success');
  handlePaymentCompleted();
}

// Stop Scan Monitoring
function stopScanMonitoring() {
  if (scanCheckInterval) {
    clearInterval(scanCheckInterval);
    scanCheckInterval = null;
  }
}

// Reset Payment Form to Step 1
function resetPaymentForm() {
  activeTransaction = null;
  currentQRISPayload = '';
  const form = document.getElementById('payment-form');
  if (form) form.reset();

  const presets = document.querySelectorAll('.btn-preset');
  presets.forEach(btn => btn.classList.remove('active'));

  switchPage(1);
}

// Switch View Page Step
function switchPage(stepNum) {
  const p1 = document.getElementById('page-step-1');
  const p2 = document.getElementById('page-step-2');
  const p3 = document.getElementById('page-step-3');

  const ind1 = document.getElementById('step-indicator-1');
  const ind2 = document.getElementById('step-indicator-2');
  const ind3 = document.getElementById('step-indicator-3');

  p1.classList.add('hidden');
  p2.classList.add('hidden');
  p3.classList.add('hidden');

  ind1.className = 'step-item';
  ind2.className = 'step-item';
  ind3.className = 'step-item';

  if (stepNum === 1) {
    stopScanMonitoring();
    p1.classList.remove('hidden');
    ind1.className = 'step-item active';
  } else if (stepNum === 2) {
    p2.classList.remove('hidden');
    ind1.className = 'step-item completed';
    ind2.className = 'step-item active';
    startScanMonitoring();
  } else if (stepNum === 3) {
    stopScanMonitoring();
    p3.classList.remove('hidden');
    ind1.className = 'step-item completed';
    ind2.className = 'step-item completed';
    ind3.className = 'step-item completed active';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Update Merchant Details in UI
function updateMerchantUI() {
  const config = getMerchantConfig();
  const elName = document.getElementById('qris-display-merchant');
  const elNmid = document.getElementById('qris-display-nmid');

  if (elName) elName.textContent = config.merchantName;
  if (elNmid) elNmid.textContent = `NMID: ${config.nmid} • A01`;
}

/* ==========================================================================
   ADMIN ACCESS LOCK & PROTECTED ACTIONS
   ========================================================================== */

// Handle Clear History Click
function handleProtectedClearHistory() {
  requestAdminAuth(() => {
    if (confirm('Apakah Anda yakin ingin mereset/menghapus SELURUH daftar rekap transaksi?')) {
      saveTransactions([]);
      renderHistoryTable();
      showToast('Seluruh rekap transaksi telah berhasil dibersihkan oleh Admin.', 'success');
    }
  }, 'Masukkan PIN Akses Web Admin untuk MERESET SELURUH REKAP TRANSAKSI.');
}

// Handle Delete Single Row
window.deleteTransaction = function(id) {
  requestAdminAuth(() => {
    let list = getTransactions();
    const initialCount = list.length;
    list = list.filter(tx => String(tx.id) !== String(id));
    
    if (list.length < initialCount) {
      saveTransactions(list);
      renderHistoryTable();
      showToast('Data transaksi berhasil dihapus oleh Admin.', 'info');
    } else {
      showToast('Transaksi tidak ditemukan.', 'error');
    }
  }, 'Masukkan PIN Akses Web Admin untuk MENGHAPUS TRANSAKSI INI.');
};

// Handle Header Admin Access Click
function handleAdminAccessClick() {
  requestAdminAuth(() => {
    openMerchantSettingsModal();
  }, 'Masukkan PIN Akses Web Admin untuk membuka Pengaturan Merchant DANA & Sistem.');
}

// Open Admin PIN Verification Modal or execute directly if unlocked
function requestAdminAuth(actionCallback, messageText) {
  if (isAdminUnlocked) {
    if (actionCallback && typeof actionCallback === 'function') {
      actionCallback();
    }
    return;
  }

  pendingAdminAction = actionCallback;

  const modal = document.getElementById('modal-admin-pin');
  const desc = document.getElementById('pin-modal-desc');
  const input = document.getElementById('admin-pin-input');
  const err = document.getElementById('pin-error-msg');

  if (desc && messageText) desc.textContent = messageText;
  if (input) input.value = '';
  if (err) err.classList.remove('show');

  if (modal) modal.classList.remove('hidden');
  if (input) setTimeout(() => input.focus(), 150);
}

// Verify Admin PIN Input
function verifyAdminPin() {
  const input = document.getElementById('admin-pin-input');
  const err = document.getElementById('pin-error-msg');
  const modalCard = document.querySelector('#modal-admin-pin .modal-card');
  const pinEntered = input ? input.value.trim() : '';
  const actualPin = getAdminPIN();

  if (pinEntered === actualPin) {
    isAdminUnlocked = true;
    try {
      sessionStorage.setItem('qris_admin_unlocked', 'true');
    } catch (e) {}

    updateAdminBadgeUI();
    closeAdminPinModal();

    if (pendingAdminAction && typeof pendingAdminAction === 'function') {
      const action = pendingAdminAction;
      pendingAdminAction = null;
      action();
    }
  } else {
    if (err) err.classList.add('show');
    if (modalCard) {
      modalCard.classList.remove('shake');
      void modalCard.offsetWidth;
      modalCard.classList.add('shake');
    }
    showToast('PIN Akses Web Salah!', 'error');
  }
}

// Close Admin PIN Modal
function closeAdminPinModal() {
  const modal = document.getElementById('modal-admin-pin');
  if (modal) modal.classList.add('hidden');
  pendingAdminAction = null;
}

// Update Admin Status Badge
function updateAdminBadgeUI() {
  const indicator = document.getElementById('admin-badge-indicator');
  const text = document.getElementById('admin-badge-text');
  const headerLabel = document.getElementById('admin-header-label');

  if (isAdminUnlocked) {
    if (indicator) indicator.classList.add('unlocked');
    if (text) text.textContent = 'Akses Admin Terbuka';
    if (headerLabel) headerLabel.textContent = 'Pengaturan Admin ⚙️';
  } else {
    if (indicator) indicator.classList.remove('unlocked');
    if (text) text.textContent = 'Proteksi Web Aktif';
    if (headerLabel) headerLabel.textContent = 'Akses Web Admin 🔒';
  }

  // Toggle a body-level class so CSS can reveal admin-only elements safely
  try {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('admin-unlocked', !!isAdminUnlocked);
    }
  } catch (e) {
    // ignore if DOM not ready
  }
}

// Open Merchant Settings Modal
function openMerchantSettingsModal() {
  const config = getMerchantConfig();

  const elMode = document.getElementById('cfg-qris-mode');
  const elName = document.getElementById('cfg-merchant-name');
  const elNmid = document.getElementById('cfg-nmid');
  const elCity = document.getElementById('cfg-city');
  const elBase = document.getElementById('cfg-qris-base');
  const elPin = document.getElementById('cfg-new-pin');

  if (elMode) elMode.value = config.qrisMode || 'dynamic';
  if (elName) elName.value = config.merchantName;
  if (elNmid) elNmid.value = config.nmid;
  if (elCity) elCity.value = config.city;
  if (elBase) elBase.value = config.qrisBase;
  if (elPin) elPin.value = '';

  updateQRISValidationStatus();

  const modal = document.getElementById('modal-merchant-settings');
  if (modal) modal.classList.remove('hidden');
}

// Save Settings from Modal
function saveMerchantSettingsFromModal() {
  const modeVal = document.getElementById('cfg-qris-mode') ? document.getElementById('cfg-qris-mode').value : 'dynamic';
  const nameVal = document.getElementById('cfg-merchant-name').value.trim();
  const nmidVal = document.getElementById('cfg-nmid').value.trim();
  const cityVal = document.getElementById('cfg-city').value.trim();
  const baseVal = document.getElementById('cfg-qris-base').value.trim();
  const newPin = document.getElementById('cfg-new-pin').value.trim();

  const newConfig = {
    qrisMode: modeVal || 'dynamic',
    merchantName: nameVal || DEFAULT_MERCHANT_CONFIG.merchantName,
    nmid: nmidVal || DEFAULT_MERCHANT_CONFIG.nmid,
    city: cityVal || DEFAULT_MERCHANT_CONFIG.city,
    mcc: '5812',
    qrisBase: baseVal || DEFAULT_MERCHANT_CONFIG.qrisBase
  };

  saveMerchantConfig(newConfig);

  if (newPin && newPin.length >= 4) {
    localStorage.setItem(ADMIN_PIN_KEY, newPin);
    showToast('PIN Akses Web Admin berhasil diperbarui!', 'success');
  }

  updateMerchantUI();
  closeMerchantSettingsModal();
  showToast('Pengaturan Merchant QRIS DANA berhasil disimpan!', 'success');
}

// Close Settings Modal
function closeMerchantSettingsModal() {
  const modal = document.getElementById('modal-merchant-settings');
  if (modal) modal.classList.add('hidden');
}
window.closeMerchantSettingsModal = closeMerchantSettingsModal;
window.closeAdminPinModal = closeAdminPinModal;

// Lock Admin Access Again
window.lockAdminAccess = function() {
  isAdminUnlocked = false;
  try {
    sessionStorage.removeItem('qris_admin_unlocked');
  } catch (e) {}
  updateAdminBadgeUI();
  closeMerchantSettingsModal();
  showToast('Akses Admin telah dikunci kembali.', 'info');
};

// Render History Table & Mobile Cards
function renderHistoryTable() {
  const tbody = document.getElementById('transaction-table-body');
  const mobileContainer = document.getElementById('transaction-cards-mobile');
  const emptyState = document.getElementById('empty-state');
  const totalCountEl = document.getElementById('stat-total-count');
  const totalNominalEl = document.getElementById('stat-total-nominal');

  const list = getTransactions();

  if (!tbody || !mobileContainer) return;

  tbody.innerHTML = '';
  mobileContainer.innerHTML = '';

  if (list.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (totalCountEl) totalCountEl.textContent = '0';
    if (totalNominalEl) totalNominalEl.textContent = 'Rp 0';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  let grandTotal = 0;

  list.forEach((tx, idx) => {
    grandTotal += (tx.amount || 0);

    // Desktop Table Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${idx + 1}</td>
      <td style="font-weight: 700;">${escapeHtml(tx.name)}</td>
      <td style="font-weight: 700; color: var(--primary);">${formatCurrency(tx.amount)}</td>
      <td>${tx.date}</td>
      <td>${tx.time}</td>
      <td><span class="badge-success">${tx.status}</span></td>
      <td>
        <button 
          type="button" 
          onclick="deleteTransaction('${tx.id}')" 
          style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px;"
          title="Hapus data (Perlu Akses Admin)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // Mobile Card View
    const card = document.createElement('div');
    card.className = 'tx-mobile-card';
    card.innerHTML = `
      <div class="tx-mobile-header">
        <span class="tx-mobile-name">${escapeHtml(tx.name)}</span>
        <span class="badge-success">${tx.status}</span>
      </div>
      <div class="tx-mobile-amount">${formatCurrency(tx.amount)}</div>
      <div class="tx-mobile-meta">
        <span>📅 ${tx.date} • 🕒 ${tx.time}</span>
        <button 
          type="button" 
          onclick="deleteTransaction('${tx.id}')" 
          style="background: none; border: none; color: var(--danger); font-size: 0.8rem; cursor: pointer;"
        >Hapus (🔒 PIN)</button>
      </div>
    `;
    mobileContainer.appendChild(card);
  });

  if (totalCountEl) totalCountEl.textContent = list.length.toString();
  if (totalNominalEl) totalNominalEl.textContent = formatCurrency(grandTotal);
}

// Search Filter
window.filterTransactions = function() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  const keyword = searchInput.value.toLowerCase().trim();
  const rows = document.querySelectorAll('#transaction-table-body tr');
  const cards = document.querySelectorAll('.tx-mobile-card');

  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(keyword) ? '' : 'none';
  });

  cards.forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(keyword) ? '' : 'none';
  });
};

// Helper for Payer Grouping
function getPayerGroupedSummary(list) {
  const groups = {};
  let totalOmset = 0;

  list.forEach(tx => {
    const rawName = (tx.name || 'Tanpa Nama').trim();
    const normKey = rawName.toLowerCase();

    if (!groups[normKey]) {
      groups[normKey] = {
        name: rawName,
        count: 0,
        totalAmount: 0
      };
    }
    groups[normKey].count += 1;
    groups[normKey].totalAmount += (tx.amount || 0);
    totalOmset += (tx.amount || 0);
  });

  const summary = Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount);
  return { summary, totalOmset };
}

// Export to Formatted Excel Spreadsheet (.xls HTML Format)
function exportToExcel() {
  const list = getTransactions();
  if (list.length === 0) {
    showToast('Tidak ada data transaksi untuk diekspor.', 'error');
    return;
  }

  const config = getMerchantConfig();
  const now = new Date();
  const exportDateStr = `${formatDateIndonesian(now)} ${formatTimeIndonesian(now)}`;
  const { summary: payerSummary, totalOmset } = getPayerGroupedSummary(list);

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Laporan QRIS</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1f2937; }
  .title-banner { background-color: #107c41; color: #ffffff; font-size: 16pt; font-weight: bold; padding: 12px; text-align: center; }
  .info-table { margin-bottom: 20px; font-size: 10pt; border: none; }
  .info-table td { border: none; padding: 4px 8px; }
  .info-label { font-weight: bold; color: #374151; width: 180px; }
  .section-title { font-size: 12pt; font-weight: bold; color: #0284c7; margin-top: 20px; margin-bottom: 10px; }
  table.data-table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  table.data-table th { background-color: #107c41; color: #ffffff; font-weight: bold; border: 1px solid #0c5d31; padding: 8px 10px; text-align: left; }
  table.data-table th.blue-header { background-color: #0284c7; border-color: #0369a1; }
  table.data-table th.num { text-align: right; }
  table.data-table th.center { text-align: center; }
  table.data-table td { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 10pt; }
  table.data-table td.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0"; }
  table.data-table td.center { text-align: center; }
  table.data-table tr:nth-child(even) { background-color: #f8fafc; }
  table.data-table tr.total-row { background-color: #e2e8f0; font-weight: bold; font-size: 10.5pt; }
</style>
</head>
<body>

  <div class="title-banner">LAPORAN REKAP TRANSAKSI PEMBAYARAN QRIS DANA</div>
  <br>

  <table class="info-table">
    <tr><td class="info-label">Nama Merchant:</td><td><b>${escapeHtml(config.merchantName || 'PEMBAYARAN DANA STORE')}</b></td></tr>
    <tr><td class="info-label">NMID:</td><td>${escapeHtml(config.nmid || 'ID1020268841902')}</td></tr>
    <tr><td class="info-label">Waktu Ekspor:</td><td>${exportDateStr}</td></tr>
    <tr><td class="info-label">Total Transaksi:</td><td><b>${list.length} Transaksi</b></td></tr>
    <tr><td class="info-label">Total Omset:</td><td><b style="color:#107c41;">${formatCurrency(totalOmset)}</b></td></tr>
  </table>

  <!-- TABEL 1: RINGKASAN REKAP PER NAMA PEMBAYAR -->
  <div class="section-title">📊 1. TABEL RINGKASAN REKAP PER NAMA PEMBAYAR (GROUPED BY NAMA)</div>
  <table class="data-table">
    <thead>
      <tr>
        <th class="blue-header center" style="width: 50px;">No</th>
        <th class="blue-header">Nama Pembayar</th>
        <th class="blue-header center">Jumlah Transaksi</th>
        <th class="blue-header num">Total Pembayaran (IDR)</th>
        <th class="blue-header num">Rata-Rata / Transaksi</th>
        <th class="blue-header num">% Kontribusi Omset</th>
      </tr>
    </thead>
    <tbody>`;

  payerSummary.forEach((item, idx) => {
    const avg = Math.round(item.totalAmount / item.count);
    const pct = totalOmset > 0 ? ((item.totalAmount / totalOmset) * 100).toFixed(1) : '0';
    html += `
      <tr>
        <td class="center">${idx + 1}</td>
        <td><b>${escapeHtml(item.name)}</b></td>
        <td class="center"><b>${item.count}x Transaksi</b></td>
        <td class="num"><b>${formatCurrency(item.totalAmount)}</b></td>
        <td class="num">${formatCurrency(avg)}</td>
        <td class="num">${pct}%</td>
      </tr>`;
  });

  html += `
      <tr class="total-row">
        <td colspan="2" class="center">TOTAL SELURUH PEMBAYAR (${payerSummary.length} Pembayar Unik)</td>
        <td class="center">${list.length} Transaksi</td>
        <td class="num">${formatCurrency(totalOmset)}</td>
        <td class="num">${formatCurrency(list.length > 0 ? Math.round(totalOmset / list.length) : 0)}</td>
        <td class="num">100%</td>
      </tr>
    </tbody>
  </table>

  <!-- TABEL 2: RINCIAN SELURUH TRANSAKSI INDIVIDUAL -->
  <div class="section-title">📋 2. TABEL RINCIAN SELURUH TRANSAKSI INDIVIDUAL</div>
  <table class="data-table">
    <thead>
      <tr>
        <th class="center" style="width: 40px;">No</th>
        <th class="center">ID Transaksi</th>
        <th>Nama Pembayar</th>
        <th class="num">Nominal (IDR)</th>
        <th class="center">Tanggal Pembayaran</th>
        <th class="center">Jam</th>
        <th class="center">Status</th>
      </tr>
    </thead>
    <tbody>`;

  list.forEach((tx, idx) => {
    html += `
      <tr>
        <td class="center">${idx + 1}</td>
        <td class="center" style="font-family: monospace;">${escapeHtml(tx.id || '-')}</td>
        <td>${escapeHtml(tx.name || '-')}</td>
        <td class="num"><b>${formatCurrency(tx.amount || 0)}</b></td>
        <td class="center">${escapeHtml(tx.date || '-')}</td>
        <td class="center">${escapeHtml(tx.time || '-')}</td>
        <td class="center" style="color: #15803d; font-weight: bold;">${escapeHtml(tx.status || 'Berhasil')}</td>
      </tr>`;
  });

  html += `
      <tr class="total-row">
        <td colspan="3" class="center">TOTAL REKAP TRANSAKSI</td>
        <td class="num">${formatCurrency(totalOmset)}</td>
        <td colspan="3" class="center">${list.length} Transaksi Berhasil</td>
      </tr>
    </tbody>
  </table>

</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileNameDate = now.toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `Laporan_Excel_QRIS_DANA_${fileNameDate}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Laporan Excel rapi (dengan ringkasan per nama) berhasil diunduh!', 'success');
}

// Export to CSV (Formatted and Neat Layout for Excel / Google Sheets)
function exportToCSV() {
  const list = getTransactions();

  if (list.length === 0) {
    showToast('Tidak ada data transaksi untuk diekspor.', 'error');
    return;
  }

  const config = getMerchantConfig();
  const now = new Date();
  const exportDateStr = `${formatDateIndonesian(now)} ${formatTimeIndonesian(now)}`;
  const { summary: payerSummary, totalOmset } = getPayerGroupedSummary(list);

  const delimiter = ';';
  const csvLines = [];

  // Metadata Header Block
  csvLines.push('sep=;'); // Explicit delimiter directive for Microsoft Excel
  csvLines.push(`"LAPORAN REKAP TRANSAKSI PEMBAYARAN QRIS DANA"`);
  csvLines.push(`"Nama Merchant";"${(config.merchantName || 'PEMBAYARAN DANA STORE').replace(/"/g, '""')}"`);
  csvLines.push(`"NMID";"${(config.nmid || 'ID1020268841902').replace(/"/g, '""')}"`);
  csvLines.push(`"Waktu Ekspor";"${exportDateStr}"`);
  csvLines.push(`"Total Transaksi";"${list.length} Transaksi"`);
  csvLines.push(`"Total Omset";"${formatCurrency(totalOmset)}"`);
  csvLines.push('');

  // TABEL 1: RINGKASAN PER NAMA PEMBAYAR
  csvLines.push(`"--- 1. TABEL RINGKASAN TOTAL PEMBAYARAN PER NAMA PEMBAYAR ---"`);
  csvLines.push(['No', 'Nama Pembayar', 'Jumlah Transaksi', 'Total Pembayaran (IDR)', 'Nominal Terformat', 'Rata-rata / Transaksi', '% Kontribusi'].map(h => `"${h}"`).join(delimiter));

  payerSummary.forEach((item, idx) => {
    const avg = Math.round(item.totalAmount / item.count);
    const pct = totalOmset > 0 ? ((item.totalAmount / totalOmset) * 100).toFixed(1) : '0';
    const row = [
      idx + 1,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.count}x Transaksi"`,
      item.totalAmount,
      `"${formatCurrency(item.totalAmount)}"`,
      `"${formatCurrency(avg)}"`,
      `"${pct}%"`
    ];
    csvLines.push(row.join(delimiter));
  });

  csvLines.push(['"TOTAL SELURUH PEMBAYAR"', `"${payerSummary.length} Pembayar Unik"`, `"${list.length} Transaksi"`, totalOmset, `"${formatCurrency(totalOmset)}"`, `"${formatCurrency(list.length > 0 ? Math.round(totalOmset / list.length) : 0)}"`, '"100%"'].join(delimiter));
  csvLines.push('');

  // TABEL 2: RINCIAN SELURUH TRANSAKSI
  csvLines.push(`"--- 2. TABEL RINCIAN SELURUH TRANSAKSI INDIVIDUAL ---"`);
  const headers = [
    'No',
    'ID Transaksi',
    'Nama Pembayar',
    'Nominal Angka (IDR)',
    'Nominal Terformat',
    'Tanggal Pembayaran',
    'Jam',
    'Status Pembayaran'
  ];
  csvLines.push(headers.map(h => `"${h}"`).join(delimiter));

  list.forEach((tx, idx) => {
    const row = [
      idx + 1,
      `"${(tx.id || '').replace(/"/g, '""')}"`,
      `"${(tx.name || '').replace(/"/g, '""')}"`,
      tx.amount || 0,
      `"${formatCurrency(tx.amount || 0)}"`,
      `"${(tx.date || '').replace(/"/g, '""')}"`,
      `"${(tx.time || '').replace(/"/g, '""')}"`,
      `"${(tx.status || '').replace(/"/g, '""')}"`
    ];
    csvLines.push(row.join(delimiter));
  });

  csvLines.push(['"TOTAL REKAP"', '""', '""', totalOmset, `"${formatCurrency(totalOmset)}"`, '""', '""', `"${list.length} Transaksi Berhasil"`].join(delimiter));

  // Join with Windows CRLF line breaks and prepend UTF-8 BOM
  const csvContent = '\uFEFF' + csvLines.join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileNameDate = now.toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `Laporan_QRIS_DANA_${fileNameDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Laporan CSV tersusun rapi berhasil diunduh!', 'success');
}

// Scroll smoothly
window.scrollToHistory = function() {
  const section = document.getElementById('transaction-history-section');
  if (section) section.scrollIntoView({ behavior: 'smooth' });
};

// Toggle Dev Note
window.toggleDevNote = function() {
  const content = document.getElementById('dev-note-content');
  const arrow = document.getElementById('dev-note-arrow');
  if (content) {
    content.classList.toggle('show');
    if (arrow) arrow.textContent = content.classList.contains('show') ? '▲' : '▼';
  }
};

// Utilities
function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatDateIndonesian(dateObj) {
  const day = dateObj.getDate();
  const month = INDONESIAN_MONTHS[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatTimeIndonesian(dateObj) {
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : ''}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }, 3500);
}
