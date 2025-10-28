const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const mockUsers = [
  { id: 1, employeeId: 'EMP-001', name: 'Maria Santos', email: 'maria@company.com', department: 'Sales', balance: 15000 },
  { id: 2, employeeId: 'EMP-002', name: 'Juan Dela Cruz', email: 'juan@company.com', department: 'IT', balance: 25450 },
  { id: 3, employeeId: 'EMP-003', name: 'Ana Garcia', email: 'ana@company.com', department: 'HR', balance: 18000 }
]

router.post('/login', async (req, res) => {
  const { employeeId, password } = req.body

  if (!employeeId || !password) {
    return res.status(400).json({
      success: false,
      message: 'Employee ID and password required'
    })
  }

  const user = mockUsers.find(u => u.employeeId === employeeId)

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    })
  }

  const token = jwt.sign(
    { userId: user.id, employeeId: user.employeeId },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  )

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        email: user.email,
        department: user.department,
        balance: user.balance
      }
    }
  })
})

router.post('/logout', (req, res) => {
  res.json({ success: true })
})

module.exports = router