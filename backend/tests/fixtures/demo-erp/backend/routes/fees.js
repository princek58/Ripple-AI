const express = require('express');
const feeService = require('../services/feeService'); // Broken import: feeService does not exist

const router = express.Router();

router.get('/', (req, res) => {
  res.json(feeService.getFees());
});

module.exports = router;
