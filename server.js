import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const paymentStore = new Map();

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname, { index: false }));

function normalizeStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return 'PENDING';

  const paidStates = ['PAID', 'SUCCESS', 'SUCCESSFUL', 'SETTLED', 'COMPLETED', 'CONFIRMED'];
  if (paidStates.includes(value)) return 'PAID';

  const pendingStates = ['PENDING', 'WAITING', 'PROCESSING', 'INITIATED', 'UNPAID'];
  if (pendingStates.includes(value)) return 'PENDING';

  if (value === 'FAILED' || value === 'REJECTED') return 'FAILED';
  return value;
}

function buildTxId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRX-${stamp}-${random}`;
}

app.get('/api/qris/config', (_req, res) => {
  res.json({
    enabled: true,
    statusUrl: '/api/qris/status/:txId',
    webhookUrl: '/api/qris/webhook',
    note: 'Backend QRIS aktif dan siap menerima konfirmasi pembayaran.'
  });
});

app.post('/api/qris/create', (req, res) => {
  const body = req.body || {};
  const txId = String(body.txId || buildTxId());
  const amount = Number(body.amount || 0);
  const customerName = String(body.customerName || 'Customer').trim() || 'Customer';

  const tx = paymentStore.get(txId) || {
    txId,
    amount: 0,
    customerName: 'Customer',
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  tx.amount = Number.isFinite(amount) ? amount : tx.amount;
  tx.customerName = customerName;
  tx.status = normalizeStatus(tx.status || 'PENDING');
  tx.updatedAt = new Date().toISOString();

  paymentStore.set(txId, tx);

  res.json({
    ok: true,
    txId,
    status: tx.status,
    amount: tx.amount,
    customerName: tx.customerName,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt
  });
});

app.get('/api/qris/status/:txId', (req, res) => {
  const txId = String(req.params.txId || '');
  const tx = paymentStore.get(txId);

  if (!tx) {
    return res.status(404).json({
      ok: false,
      txId,
      status: 'NOT_FOUND',
      message: 'Transaksi belum terdaftar di backend.'
    });
  }

  return res.json({
    ok: true,
    txId: tx.txId,
    status: tx.status,
    amount: tx.amount,
    customerName: tx.customerName,
    paidAt: tx.paidAt || null,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt
  });
});

app.post('/api/qris/webhook', (req, res) => {
  const body = req.body || {};
  const txId = String(body.txId || '').trim();

  if (!txId) {
    return res.status(400).json({ ok: false, message: 'txId wajib diisi.' });
  }

  const tx = paymentStore.get(txId) || {
    txId,
    amount: 0,
    customerName: 'Customer',
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  if (body.amount != null) tx.amount = Number(body.amount) || tx.amount;
  if (body.customerName) tx.customerName = String(body.customerName).trim();

  tx.status = normalizeStatus(body.status || tx.status || 'PENDING');
  tx.updatedAt = new Date().toISOString();

  if (tx.status === 'PAID') {
    tx.paidAt = tx.paidAt || new Date().toISOString();
  }

  paymentStore.set(txId, tx);

  return res.json({
    ok: true,
    txId: tx.txId,
    status: tx.status,
    amount: tx.amount,
    customerName: tx.customerName,
    paidAt: tx.paidAt || null
  });
});

app.post('/api/qris/simulate-payment', (req, res) => {
  const body = req.body || {};
  const txId = String(body.txId || '').trim();

  if (!txId) {
    return res.status(400).json({ ok: false, message: 'txId wajib diisi.' });
  }

  const tx = paymentStore.get(txId) || {
    txId,
    amount: 0,
    customerName: 'Customer',
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  tx.status = 'PAID';
  tx.paidAt = new Date().toISOString();
  tx.updatedAt = tx.paidAt;
  paymentStore.set(txId, tx);

  return res.json({
    ok: true,
    txId: tx.txId,
    status: tx.status,
    message: 'Pembayaran berhasil disimulasi.'
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'qris-backend', status: 'running' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, message: 'Endpoint API tidak ditemukan.' });
  }

  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`QRIS backend running on http://localhost:${PORT}`);
});
