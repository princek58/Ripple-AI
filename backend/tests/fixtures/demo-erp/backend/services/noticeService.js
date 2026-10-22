const Notice = require('../models/Notice');
const helpers = require('../utils/helpers');

function getAllNotices() {
  return Notice.find();
}

function createNotice(data) {
  const formatted = helpers.formatText(data.title);
  return Notice.create({ ...data, title: formatted });
}

module.exports = { getAllNotices, createNotice };
