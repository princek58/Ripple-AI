import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Ripple AI Backend listening on port ${PORT}`);
});
