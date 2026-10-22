const format = require('./format');

function formatText(text) {
  return format.capitalize(text);
}

function helperUtil() {
  return 'help';
}

module.exports = { formatText, helperUtil };
