import React, { useEffect, useState } from 'react';

export const NoticePage: React.FC = () => {
  const [notices, setNotices] = useState<any[]>([]);

  useEffect(() => {
    // Matches GET /api/notices route
    fetch('/api/notices')
      .then((res) => res.json())
      .then((data) => setNotices(data));

    // Has no matching route in backend
    fetch('/api/notice/list')
      .then((res) => res.json())
      .catch(() => {});
  }, []);

  return <div>Notices Count: {notices.length}</div>;
};

export default NoticePage;
