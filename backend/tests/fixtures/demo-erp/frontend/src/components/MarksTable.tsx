import React, { useEffect } from 'react';
import axios from 'axios';

export const MarksTable: React.FC = () => {
  useEffect(() => {
    // Matches GET /api/marks route
    axios.get('/api/marks');
  }, []);

  return <table><thead><tr><th>Marks</th></tr></thead></table>;
};

export default MarksTable;
