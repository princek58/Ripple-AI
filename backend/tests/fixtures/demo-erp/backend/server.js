const express = require('express');
const noticesRouter = require('./routes/notices');
const marksRouter = require('./routes/marks');
const loginRouter = require('./routes/login');

const app = express();
app.use(express.json());

app.use('/api/notices', noticesRouter);
app.use('/api/marks', marksRouter);
app.use('/api/login', loginRouter);

module.exports = app;
