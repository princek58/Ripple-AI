const helpers = require('./helpers');

function capitalize(str) {
  if (!str) return '';
  return str.toUpperCase();
}

function formatWithHelper(val) {
  return helpers.helperUtil() + ': ' + val;
}

module.exports = { capitalize, formatWithHelper };
