const noticeService = require('../services/noticeService');

describe('Notices Service Test', () => {
  it('gets all notices', () => {
    const list = noticeService.getAllNotices();
    expect(list.length).toBeGreaterThan(0);
  });
});
