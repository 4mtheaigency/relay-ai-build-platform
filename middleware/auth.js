const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'relay-secret-key-change-in-production';

function authenticate(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate, JWT_SECRET };
