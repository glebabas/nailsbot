import React from 'react';
import { MasterView } from './MasterView';

export const MasterApp: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col font-sans selection:bg-rose-100 selection:text-rose-900">
      <main className="flex-1 max-w-md w-full mx-auto">
        <MasterView />
      </main>
    </div>
  );
};
