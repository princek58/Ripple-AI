import React, { useEffect } from 'react';

export const DynamicPage: React.FC = () => {
  const variablePath = './submodules/feature';
  const baseUrl = '/api/dynamic/';
  const id = '123';

  useEffect(() => {
    // Dynamic import with non-literal argument (unresolved)
    import(variablePath).catch(() => {});

    // Runtime-built URL in fetch (unresolved)
    fetch(baseUrl + id).catch(() => {});
  }, []);

  return <div>Dynamic Page</div>;
};

export default DynamicPage;
