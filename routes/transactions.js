const express = require('express')
const router = express.Router()

const mockTransactions = [
  { id: 'TXN-001', type: 'sent', recipient: 'Maria Santos', amount: 5000, status: 'success', date: new Date(Date.now() - 86400000).toISOString() },
  { id: 'TXN-002', type: 'received', sender: 'Carlos Reyes', amount: 10000, status: 'success', date: new Date(Date.now() - 172800000).toISOString() },
  { id: 'TXN-003', type: 'sent', recipient: 'Ana Garcia', amount: 2500, status: 'pending', date: new Date(Date.now() - 3600000).toISOString() },
  { id: 'TXN-004', type: 'received', sender: 'Miguel Cruz', amount: 7500, status: 'success', date: new Date(Date.now() - 259200000).toISOString() },
  { id: 'TXN-005', type: 'sent', recipient: 'Rosa Gonzales', amount: 3000, status: 'failed', date: new Date(Date.now() - 345600000).toISOString() }
]

router.get('/', (req, res) => {
  const { type, status } = req.query

  let filtered = [...mockTransactions]

  if (type && type !== 'all') {
    filtered = filtered.filter(t => t.type === type)
  }

  if (status) {
    filtered = filtered.filter(t => t.status === status)
  }

  res.json({
    success: true,
    data: {
      transactions: filtered.sort((a, b) => new Date(b.date) - new Date(a.date)),
      total: filtered.length
    }
  })
})

router.get('/:id', (req, res) => {
  const { id } = req.params

  const transaction = mockTransactions.find(t => t.id === id)

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found'
    })
  }

  res.json({
    success: true,
    data: transaction
  })
})

module.exports = router