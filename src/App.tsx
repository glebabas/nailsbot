import React, { useState, useEffect } from 'react';
import { ClientApp } from './components/ClientApp';
import { MasterApp } from './components/MasterApp';
import { isUserMaster, initTelegramWebApp } from './utils/telegram';

export default function App() {
  // Автоматическая и невидимая авторизация по Telegram WebApp initDataUnsafe.user.id
  // или URL query параметру ?role=master / ?role=client
  const [role, setRole] = useState<'client' | 'master'>(() => {
    return isUserMaster() ? 'master' : 'client';
  });

  useEffect(() => {
    initTelegramWebApp();

    // Слушатель изменения URL search параметров (для роутинга внутри Telegram Web App)
    const checkRole = () => {
      setRole(isUserMaster() ? 'master' : 'client');
    };

    window.addEventListener('popstate', checkRole);
    return () => window.removeEventListener('popstate', checkRole);
  }, []);

  return (
    <div className="w-full min-h-screen">
      {role === 'master' ? <MasterApp /> : <ClientApp />}
    </div>
  );
}
