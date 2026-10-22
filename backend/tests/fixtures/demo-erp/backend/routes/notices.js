const express = require('express');
const noticeService = require('../services/noticeService');

const router = express.Router();

router.get('/', (req, res) => {
  const notices = noticeService.getAllNotices();
  res.json(notices);
});

router.post('/', (req, res) => {
  const created = noticeService.createNotice(req.body);
  res.status(201).json(created);
});

module.exports = router;
