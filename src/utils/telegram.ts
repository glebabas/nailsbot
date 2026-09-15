/**
 * Интеграция с Telegram Web App SDK (window.Telegram.WebApp)
 * Предоставляет безопасный доступ к контексту Telegram с мок-фоллбеком для браузера.
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          query_id?: string;
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            is_premium?: boolean;
          };
          auth_date?: string;
          hash?: string;
        };
        version?: string;
        platform?: string;
        colorScheme?: 'light' | 'dark';
        themeParams?: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        isExpanded?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        headerColor?: string;
        backgroundColor?: string;
        isClosingConfirmationEnabled?: boolean;
        
        // Методы
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        enableClosingConfirmation?: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        
        showAlert?: (message: string, callback?: () => void) => void;
        showConfirm?: (message: string, callback?: (confirmed: boolean) => void) => void;
        
        BackButton?: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        
        MainButton?: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive?: boolean) => void;
          hideProgress: () => void;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
      };
    };
  }
}

export const getTelegramWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

export const initTelegramWebApp = () => {
  const tg = getTelegramWebApp();
  if (tg) {
    try {
      tg.ready?.();
      tg.expand?.();
      tg.enableClosingConfirmation?.();
      // Настройка акцентных цветов в стиле Telegram
      if (tg.setHeaderColor) {
        tg.setHeaderColor('#FAF8F5');
      }
      if (tg.setBackgroundColor) {
        tg.setBackgroundColor('#FAF8F5');
      }
    } catch (e) {
      console.warn('Ошибка инициализации Telegram WebApp SDK:', e);
    }
  }
};

export const getTelegramUser = () => {
  const tg = getTelegramWebApp();
  const user = tg?.initDataUnsafe?.user;
  if (user) {
    return {
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      isRealTelegram: true,
    };
  }
  // Мок пользователя для отладки в браузере
  return {
    id: 549120491,
    firstName: 'Алина',
    lastName: 'Смирнова',
    username: 'alina_beauty',
    isRealTelegram: false,
  };
};

const envMasterIds = ((import.meta as any).env?.VITE_MASTER_TG_IDS as string | undefined)
  ?.split(',')
  .map((s: string) => parseInt(s.trim(), 10))
  .filter(Boolean) || [];

export const MASTER_TG_IDS = Array.from(new Set([1324896381, 781432351, 549120491, 123456789, ...envMasterIds]));

export const isUserMaster = (): boolean => {
  const tg = getTelegramWebApp();
  const userId = tg?.initDataUnsafe?.user?.id;
  const startParam = (tg?.initDataUnsafe as { start_param?: string } | undefined)?.start_param;

  // Проверка параметров URL (?role=master или ?role=client)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    if (roleParam === 'master') return true;
    if (roleParam === 'client') return false;
  }

  if (startParam === 'master') return true;
  if (startParam === 'client') return false;

  // Проверка по ID пользователя в Telegram
  if (userId && MASTER_TG_IDS.includes(userId)) {
    return true;
  }

  return false;
};

export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => {
  const tg = getTelegramWebApp();
  if (!tg?.HapticFeedback) return;

  try {
    if (type === 'success' || type === 'warning' || type === 'error') {
      tg.HapticFeedback.notificationOccurred(type);
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  } catch {
    // Безопасный игнор в среде без вибрации
  }
};

export const closeTelegramWebApp = () => {
  const tg = getTelegramWebApp();
  if (tg?.close) {
    tg.close();
  } else {
    console.log('[Telegram WebApp] Запрос на закрытие окна');
  }
};
