import React, { useState, useEffect } from 'react';
import { ClientApp } from './components/ClientApp';
import { MasterApp } from './components/MasterApp';
import { MasterSettings } from './components/MasterSettings';
import { isUserMaster, isUserStrictMaster, initTelegramWebApp, closeTelegramWebApp } from './utils/telegram';

export default function App() {
  const [isSettingsView, setIsSettingsView] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') === 'settings' || params.get('tab') === 'settings';
    }
    return false;
  });

  const [isAuthorizedMaster, setIsAuthorizedMaster] = useState<boolean>(() => {
    return isUserStrictMaster();
  });

  const [role, setRole] = useState<'client' | 'master'>(() => {
    return isUserMaster() ? 'master' : 'client';
  });

  useEffect(() => {
    initTelegramWebApp();

    const checkState = () => {
      const params = new URLSearchParams(window.location.search);
      setIsSettingsView(params.get('view') === 'settings' || params.get('tab') === 'settings');
      setIsAuthorizedMaster(isUserStrictMaster());
      setRole(isUserMaster() ? 'master' : 'client');
    };

    window.addEventListener('popstate', checkState);
    return () => window.removeEventListener('popstate', checkState);
  }, []);

  // Если открыты настройки из кнопки бота
  if (isSettingsView) {
    if (!isAuthorizedMaster) {
      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-md max-w-sm w-full text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto text-3xl">
              ⛔
            </div>
            <h2 className="text-base font-bold text-stone-900">Доступ ограничен</h2>
            <p className="text-xs text-stone-600 leading-relaxed">
              Раздел настроек доступен исключительно мастеру с доверенного Telegram ID.
            </p>
            <button
              type="button"
              onClick={() => closeTelegramWebApp()}
              className="w-full mt-2 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold cursor-pointer transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-stone-50/70 pb-16">
        <header className="bg-white border-b border-stone-200/80 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <div>
              <h1 className="text-sm font-bold text-stone-900 leading-tight">Настройки студии и услуг</h1>
              <p className="text-[10px] text-stone-500">Панель управления мастера</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => closeTelegramWebApp()}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </header>
        <main className="max-w-md mx-auto px-4 pt-4">
          <MasterSettings />
        </main>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen">
      {role === 'master' ? <MasterApp /> : <ClientApp />}
    </div>
  );
}
