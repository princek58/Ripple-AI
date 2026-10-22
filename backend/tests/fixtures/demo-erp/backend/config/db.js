const dbUrl = process.env.DB_URL;
const jwtSecret = process.env.JWT_SECRET;

function connect() {
  console.log('Connecting to db:', dbUrl ? 'Configured' : 'Missing');
}

module.exports = { connect, dbUrl, jwtSecret };
