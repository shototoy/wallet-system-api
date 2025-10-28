import express from 'express';
import cors from 'cors';
import { initDB, getDB } from './db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import os from 'os';

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

console.log('🚀 Initializing Wallet System...');
await initDB();
console.log('✓ Database initialized');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

function generateReference() {
  return `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, pin } = req.body;
    
    if (!name || !phone || !pin) {
      return res.status(400).json({ error: 'Name, phone, and PIN are required' });
    }
    
    if (phone.length !== 11 || !/^\d{11}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone must be 11 digits' });
    }
    
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 6 digits' });
    }
    
    const db = getDB();
    const [existing] = await db.execute('SELECT id FROM wallet_users WHERE phone = ?', [phone]);
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Phone number already exists' });
    }
    
    const hash = await bcrypt.hash(pin, 10);
    const [result] = await db.execute(
      'INSERT INTO wallet_users (phone, pin, name, status) VALUES (?, ?, ?, ?)',
      [phone, hash, name, 'active']
    );
    
    await db.execute('INSERT INTO wallets (user_id, balance) VALUES (?, ?)', [result.insertId, 0.00]);
    
    console.log(`✓ New user registered: ${phone} - ${name}`);
    res.json({ success: true, message: 'Registration successful' });
  } catch (e) {
    console.error('✗ Registration error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { phone, pin } = req.body;
    const db = getDB();
    const [rows] = await db.execute('SELECT * FROM wallet_users WHERE phone = ? AND status = ?', [phone, 'active']);
    
    if (rows.length === 0) {
      console.log('✗ Login failed: Phone not found -', phone);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = rows[0];
    const valid = await bcrypt.compare(pin, user.pin);
    
    if (!valid) {
      console.log('✗ Login failed: Invalid PIN -', phone);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    let [wallet] = await db.execute('SELECT * FROM wallets WHERE user_id = ?', [user.id]);
    if (wallet.length === 0) {
      await db.execute('INSERT INTO wallets (user_id, balance) VALUES (?, ?)', [user.id, 0.00]);
      console.log(`✓ Wallet created for ${user.name}`);
    }
    
    await db.execute('UPDATE wallet_users SET last_login = NOW() WHERE id = ?', [user.id]);
    const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '24h' });
    
    console.log(`✓ Login successful: ${phone} - ${user.name}`);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        phone: user.phone
      } 
    });
  } catch (e) {
    console.error('✗ Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/balance', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDB();
    const [wallet] = await db.execute('SELECT balance, currency, status FROM wallets WHERE user_id = ?', [userId]);
    if (wallet.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    console.log(`✓ Balance retrieved: User ${userId} - ₱${wallet[0].balance.toLocaleString()}`);
    res.json({ 
      balance: parseFloat(wallet[0].balance),
      currency: wallet[0].currency,
      status: wallet[0].status
    });
  } catch (e) {
    console.error('✗ Error retrieving balance:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/transactions', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDB();
    const [transactions] = await db.execute(`
      SELECT 
        t.*,
        u1.name as from_name,
        u2.name as to_name
      FROM transactions t
      LEFT JOIN wallet_users u1 ON t.from_user_id = u1.id
      LEFT JOIN wallet_users u2 ON t.to_user_id = u2.id
      WHERE t.from_user_id = ? OR t.to_user_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [userId, userId]);
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      type: tx.from_user_id === userId ? 'sent' : 'received',
      amount: parseFloat(tx.amount),
      currency: 'PHP',
      from: tx.from_name || 'System',
      to: tx.to_name || 'System',
      description: tx.description || (tx.from_user_id === userId ? `Sent to ${tx.to_name}` : `Received from ${tx.from_name}`),
      status: tx.status,
      reference: tx.reference,
      created_at: tx.created_at
    }));
    console.log(`✓ Transactions retrieved: ${userId} - ${formattedTransactions.length} records`);
    res.json({ transactions: formattedTransactions });
  } catch (e) {
    console.error('✗ Error retrieving transactions:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/transactions/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const db = getDB();
    const [transactions] = await db.execute(`
      SELECT 
        t.*,
        u1.name as from_name,
        u2.name as to_name
      FROM transactions t
      LEFT JOIN wallet_users u1 ON t.from_user_id = u1.id
      LEFT JOIN wallet_users u2 ON t.to_user_id = u2.id
      WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)
    `, [id, userId, userId]);
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const tx = transactions[0];
    const formattedTransaction = {
      id: tx.id,
      type: tx.from_user_id === userId ? 'sent' : 'received',
      amount: parseFloat(tx.amount),
      currency: 'PHP',
      from: tx.from_name || 'System',
      to: tx.to_name || 'System',
      description: tx.description,
      status: tx.status,
      reference: tx.reference,
      created_at: tx.created_at
    };
    console.log(`✓ Transaction detail retrieved: ${id}`);
    res.json({ transaction: formattedTransaction });
  } catch (e) {
    console.error('✗ Error retrieving transaction detail:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/wallet/transfer', auth, async (req, res) => {
  const connection = await getDB().getConnection();
  try {
    const { recipientUsername, amount, pin } = req.body;
    const senderId = req.user.id;
    if (!recipientUsername || !amount) {
      return res.status(400).json({ error: 'Recipient username and amount are required' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    await connection.beginTransaction();
    const [recipient] = await connection.execute('SELECT id, name FROM wallet_users WHERE phone = ? AND status = ?', [recipientUsername, 'active']);
    if (recipient.length === 0) {
      await connection.rollback();
      console.log('✗ Transfer failed: Recipient not found -', recipientUsername);
      return res.status(404).json({ error: 'Recipient not found' });
    }
    const recipientId = recipient[0].id;
    if (senderId === recipientId) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    const [senderWallet] = await connection.execute('SELECT balance, status FROM wallets WHERE user_id = ? FOR UPDATE', [senderId]);
    if (senderWallet.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sender wallet not found' });
    }
    if (senderWallet[0].status !== 'active') {
      await connection.rollback();
      return res.status(400).json({ error: 'Wallet is not active' });
    }
    if (parseFloat(senderWallet[0].balance) < amount) {
      await connection.rollback();
      console.log('✗ Transfer failed: Insufficient balance -', senderId);
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    let [recipientWallet] = await connection.execute('SELECT id FROM wallets WHERE user_id = ?', [recipientId]);
    if (recipientWallet.length === 0) {
      await connection.execute('INSERT INTO wallets (user_id, balance) VALUES (?, ?)', [recipientId, 0]);
    }
    await connection.execute('UPDATE wallets SET balance = balance - ?, updated_at = NOW() WHERE user_id = ?', [amount, senderId]);
    await connection.execute('UPDATE wallets SET balance = balance + ?, updated_at = NOW() WHERE user_id = ?', [amount, recipientId]);
    const reference = generateReference();
    await connection.execute(
      'INSERT INTO transactions (from_user_id, to_user_id, amount, type, status, reference, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [senderId, recipientId, amount, 'transfer', 'completed', reference, `Transfer to ${recipient[0].name}`]
    );
    await connection.commit();
    const [sender] = await connection.execute('SELECT name FROM wallet_users WHERE id = ?', [senderId]);
    console.log(`✓ Transfer successful: ${sender[0].name} → ${recipient[0].name} - ₱${amount.toLocaleString()}`);
    res.json({ 
      success: true,
      message: 'Transfer successful',
      transaction: {
        reference,
        type: 'sent',
        amount,
        currency: 'PHP',
        from: sender[0].name,
        to: recipient[0].name,
        status: 'completed',
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    await connection.rollback();
    console.error('✗ Transfer error:', e.message);
    res.status(500).json({ error: 'Transfer failed', details: e.message });
  } finally {
    connection.release();
  }
});

app.get('/api/wallet/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;
    if (!q || q.trim().length < 2) {
      return res.json({ users: [] });
    }
    const db = getDB();
    const searchTerm = `%${q}%`;
    const [users] = await db.execute(
      'SELECT id, username, name, phone FROM wallet_users WHERE (name LIKE ? OR username LIKE ?) AND id != ? AND status = ? LIMIT 10',
      [searchTerm, searchTerm, userId, 'active']
    );
    console.log(`✓ User search: "${q}" - ${users.length} results`);
    res.json({ users });
  } catch (e) {
    console.error('✗ Search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n💰 Wallet System Ready');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Local:   http://localhost:${PORT}`);
  console.log(`📍 Network: http://${localIP}:${PORT}`);
  if (process.env.RAILWAY_STATIC_URL) {
    console.log(`📍 Railway: https://${process.env.RAILWAY_STATIC_URL}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Using Railway MySQL Database');
  console.log('✓ Server listening on all interfaces (0.0.0.0)');
  console.log('✓ All systems operational\n');
});