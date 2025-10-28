import mysql from 'mysql2/promise';

let pool = null;

export async function initDB() {
  try {
    const config = {
      host: process.env.MYSQLHOST,
      port: process.env.MYSQLPORT,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };
    pool = mysql.createPool(config);
    const connection = await pool.getConnection();
    console.log('✓ MySQL connected to Railway');
    console.log(`  Host: ${config.host}:${config.port}`);
    console.log(`  Database: ${config.database}`);
    await createWalletTables(connection);
    connection.release();
    return pool;
  } catch (error) {
    console.error('✗ MySQL connection failed:', error.message);
    throw error;
  }
}

async function createWalletTables(connection) {
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wallets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        staff_id VARCHAR(50) UNIQUE NOT NULL,
        balance DECIMAL(12,2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'PHP',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
        INDEX idx_staff_id (staff_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        from_staff_id VARCHAR(50),
        to_staff_id VARCHAR(50),
        amount DECIMAL(12,2) NOT NULL,
        type ENUM('transfer', 'topup', 'payment', 'refund') DEFAULT 'transfer',
        status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'completed',
        description TEXT,
        reference VARCHAR(50) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
        FOREIGN KEY (to_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
        INDEX idx_from_staff (from_staff_id),
        INDEX idx_to_staff (to_staff_id),
        INDEX idx_created_at (created_at),
        INDEX idx_reference (reference)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Wallet tables verified/created');
  } catch (error) {
    console.error('✗ Error creating wallet tables:', error.message);
    throw error;
  }
}

export function getDB() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return pool;
}

export async function closeDB() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ MySQL connection closed');
  }
}