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

console.log('🚀 Initializing Employee Wallet System...');
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

app.post('/api/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;
    const db = getDB();
    const [rows] = await db.execute('SELECT * FROM staff WHERE id = ? AND role != ?', [employeeId, 'admin']);
    if (rows.length === 0) {
      console.log('✗ Login failed: Employee ID not found -', employeeId);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log('✗ Login failed: Invalid password -', employeeId);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    let [wallet] = await db.execute('SELECT * FROM wallets WHERE staff_id = ?', [user.id]);
    if (wallet.length === 0) {
      await db.execute('INSERT INTO wallets (staff_id, balance) VALUES (?, ?)', [user.id, 50000.00]);
      console.log(`✓ Wallet created for ${user.name} with initial balance ₱50,000`);
    }
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    console.log(`✓ Login successful: ${employeeId} - ${user.name}`);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        username: user.username,
        department: user.department, 
        position: user.position 
      } 
    });
  } catch (e) {
    console.error('✗ Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/balance', auth, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const db = getDB();
    const [wallet] = await db.execute('SELECT balance, currency FROM wallets WHERE staff_id = ?', [employeeId]);
    if (wallet.length === 0) {
      await db.execute('INSERT INTO wallets (staff_id, balance) VALUES (?, ?)', [employeeId, 50000.00]);
      console.log(`✓ Wallet created for employee ${employeeId}`);
      return res.json({ balance: 50000.00, currency: 'PHP' });
    }
    console.log(`✓ Balance retrieved: ${employeeId} - ₱${wallet[0].balance.toLocaleString()}`);
    res.json({ 
      balance: parseFloat(wallet[0].balance),
      currency: wallet[0].currency
    });
  } catch (e) {
    console.error('✗ Error retrieving balance:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/transactions', auth, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const db = getDB();
    const [transactions] = await db.execute(`
      SELECT 
        t.*,
        s1.name as from_name,
        s2.name as to_name
      FROM transactions t
      LEFT JOIN staff s1 ON t.from_staff_id = s1.id
      LEFT JOIN staff s2 ON t.to_staff_id = s2.id
      WHERE t.from_staff_id = ? OR t.to_staff_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [employeeId, employeeId]);
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      type: tx.from_staff_id === employeeId ? 'sent' : 'received',
      amount: parseFloat(tx.amount),
      currency: 'PHP',
      from: tx.from_name || 'System',
      to: tx.to_name || 'System',
      description: tx.description || (tx.from_staff_id === employeeId ? `Sent to ${tx.to_name}` : `Received from ${tx.from_name}`),
      status: tx.status,
      reference: tx.reference,
      created_at: tx.created_at
    }));
    console.log(`✓ Transactions retrieved: ${employeeId} - ${formattedTransactions.length} records`);
    res.json({ transactions: formattedTransactions });
  } catch (e) {
    console.error('✗ Error retrieving transactions:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/transactions/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user.id;
    const db = getDB();
    const [transactions] = await db.execute(`
      SELECT 
        t.*,
        s1.name as from_name,
        s2.name as to_name
      FROM transactions t
      LEFT JOIN staff s1 ON t.from_staff_id = s1.id
      LEFT JOIN staff s2 ON t.to_staff_id = s2.id
      WHERE t.id = ? AND (t.from_staff_id = ? OR t.to_staff_id = ?)
    `, [id, employeeId, employeeId]);
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const tx = transactions[0];
    const formattedTransaction = {
      id: tx.id,
      type: tx.from_staff_id === employeeId ? 'sent' : 'received',
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
    const { recipientId, amount, pin } = req.body;
    const senderId = req.user.id;
    if (!recipientId || !amount) {
      return res.status(400).json({ error: 'Recipient ID and amount are required' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    if (senderId === recipientId) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    await connection.beginTransaction();
    const [recipient] = await connection.execute('SELECT name FROM staff WHERE id = ? AND role != ?', [recipientId, 'admin']);
    if (recipient.length === 0) {
      await connection.rollback();
      console.log('✗ Transfer failed: Recipient not found -', recipientId);
      return res.status(404).json({ error: 'Recipient not found' });
    }
    const [senderWallet] = await connection.execute('SELECT balance FROM wallets WHERE staff_id = ? FOR UPDATE', [senderId]);
    if (senderWallet.length === 0 || parseFloat(senderWallet[0].balance) < amount) {
      await connection.rollback();
      console.log('✗ Transfer failed: Insufficient balance -', senderId);
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    let [recipientWallet] = await connection.execute('SELECT id FROM wallets WHERE staff_id = ?', [recipientId]);
    if (recipientWallet.length === 0) {
      await connection.execute('INSERT INTO wallets (staff_id, balance) VALUES (?, ?)', [recipientId, 0]);
    }
    await connection.execute('UPDATE wallets SET balance = balance - ? WHERE staff_id = ?', [amount, senderId]);
    await connection.execute('UPDATE wallets SET balance = balance + ? WHERE staff_id = ?', [amount, recipientId]);
    const reference = generateReference();
    await connection.execute(
      'INSERT INTO transactions (from_staff_id, to_staff_id, amount, type, status, reference, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [senderId, recipientId, amount, 'transfer', 'completed', reference, `Transfer to ${recipient[0].name}`]
    );
    await connection.commit();
    const [sender] = await connection.execute('SELECT name FROM staff WHERE id = ?', [senderId]);
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
    const employeeId = req.user.id;
    if (!q || q.trim().length < 2) {
      return res.json({ employees: [] });
    }
    const db = getDB();
    const searchTerm = `%${q}%`;
    const [employees] = await db.execute(
      'SELECT id, name, department, position FROM staff WHERE (name LIKE ? OR id LIKE ?) AND id != ? AND role != ? LIMIT 10',
      [searchTerm, searchTerm, employeeId, 'admin']
    );
    console.log(`✓ Employee search: "${q}" - ${employees.length} results`);
    res.json({ employees });
  } catch (e) {
    console.error('✗ Search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n💰 Employee Wallet System Ready');
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