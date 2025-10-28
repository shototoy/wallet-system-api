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
    await dropWalletTables(connection);
    await createWalletTables(connection);
    connection.release();
    return pool;
  } catch (error) {
    console.error('✗ MySQL connection failed:', error.message);
    throw error;
  }
}

async function dropWalletTables(connection) {
  try {
    await connection.execute(`DROP TABLE IF EXISTS transaction_fees`);
    await connection.execute(`DROP TABLE IF EXISTS transactions`);
    await connection.execute(`DROP TABLE IF EXISTS wallets`);
    await connection.execute(`DROP TABLE IF EXISTS wallet_users`);
    console.log('✓ Wallet tables dropped');
  } catch (error) {
    console.error('✗ Error dropping wallet tables:', error.message);
    throw error;
  }
}

async function createWalletTables(connection) {
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wallet_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(50) UNIQUE NOT NULL,
        pin VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        INDEX idx_phone (phone),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wallets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE NOT NULL,
        balance DECIMAL(12,2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'PHP',
        status ENUM('active', 'frozen', 'closed') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES wallet_users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        from_user_id INT,
        to_user_id INT,
        amount DECIMAL(12,2) NOT NULL,
        type ENUM('transfer', 'topup', 'payment', 'refund', 'cashout') DEFAULT 'transfer',
        status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'completed',
        description TEXT,
        reference VARCHAR(50) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES wallet_users(id) ON DELETE SET NULL,
        FOREIGN KEY (to_user_id) REFERENCES wallet_users(id) ON DELETE SET NULL,
        INDEX idx_from_user (from_user_id),
        INDEX idx_to_user (to_user_id),
        INDEX idx_created_at (created_at),
        INDEX idx_reference (reference),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
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