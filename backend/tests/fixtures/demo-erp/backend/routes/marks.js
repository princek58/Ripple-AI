const express = require('express');
const marksService = require('../services/marksService');

const router = express.Router();

router.get('/', (req, res) => {
  const marks = marksService.getMarks();
  res.json(marks);
});

module.exports = router;
