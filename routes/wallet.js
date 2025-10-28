const express = require('express')
const router = express.Router()

const mockEmployees = [
  { id: 'EMP-001', name: 'Maria Santos', department: 'Sales' },
  { id: 'EMP-002', name: 'Juan Dela Cruz', department: 'IT' },
  { id: 'EMP-003', name: 'Ana Garcia', department: 'HR' },
  { id: 'EMP-004', name: 'Pedro Reyes', department: 'Operations' },
  { id: 'EMP-005', name: 'Sofia Martinez', department: 'Finance' },
  { id: 'EMP-006', name: 'Carlos Bautista', department: 'Marketing' },
  { id: 'EMP-007', name: 'Elena Cruz', department: 'Sales' },
  { id: 'EMP-008', name: 'Miguel Torres', department: 'IT' }
]

let currentBalance = 25450.00

router.get('/balance', (req, res) => {
  res.json({
    success: true,
    data: {
      balance: currentBalance,
      currency: 'PHP'
    }
  })
})

router.get('/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase()

  if (!query) {
    return res.json({ success: true, data: [] })
  }

  const results = mockEmployees.filter(emp =>
    emp.name.toLowerCase().includes(query) ||
    emp.id.toLowerCase().includes(query)
  )

  res.json({
    success: true,
    data: results.slice(0, 5)
  })
})

router.post('/transfer', (req, res) => {
  const { recipientId, amount, pin } = req.body

  if (!recipientId || !amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transfer details'
    })
  }

  const recipient = mockEmployees.find(emp => emp.id === recipientId)

  if (!recipient) {
    return res.status(404).json({
      success: false,
      message: 'Recipient not found'
    })
  }

  if (pin && pin !== '123456') {
    return res.status(400).json({
      success: false,
      message: 'Invalid PIN'
    })
  }

  if (currentBalance < amount) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient balance'
    })
  }

  currentBalance -= amount
  const referenceNumber = `TXN${Date.now().toString().slice(-10)}`

  res.json({
    success: true,
    referenceNumber,
    data: {
      recipientId,
      recipientName: recipient.name,
      amount,
      timestamp: new Date().toISOString(),
      newBalance: currentBalance
    }
  })
})

router.post('/qr-generate', (req, res) => {
  const { amount } = req.body

  res.json({
    success: true,
    data: {
      qrCode: `QR-${Date.now()}`,
      expiresIn: 300
    }
  })
})

router.post('/qr-pay', (req, res) => {
  const { qrCode, amount, pin } = req.body

  if (!qrCode || !qrCode.startsWith('QR-')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid QR code'
    })
  }

  if (pin && pin !== '123456') {
    return res.status(400).json({
      success: false,
      message: 'Invalid PIN'
    })
  }

  res.json({
    success: true,
    referenceNumber: `QR-TXN${Date.now().toString().slice(-10)}`,
    data: {
      amount,
      timestamp: new Date().toISOString()
    }
  })
})

module.exports = router