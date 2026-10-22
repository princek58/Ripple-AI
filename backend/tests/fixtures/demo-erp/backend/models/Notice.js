const db = require('../config/db');

class Notice {
  static find() {
    return [{ id: 1, title: 'Notice 1' }];
  }

  static create(data) {
    return { id: 2, ...data };
  }
}

module.exports = Notice;
