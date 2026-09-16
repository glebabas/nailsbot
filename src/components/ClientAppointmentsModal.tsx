import React, { useState, useEffect } from 'react';
import { ClientAppointment } from '../types';
import { api } from '../services/api';

interface ClientAppointmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tgId?: number;
  onBookNew: () => void;
}

export const ClientAppointmentsModal: React.FC<ClientAppointmentsModalProps> = ({
  isOpen,
  onClose,
  tgId,
  onBookNew,
}) => {
  const [appointments, setAppointments] = useState<ClientAppointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Изменились планы');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const clientId = tgId || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id || 1324896381;

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await api.getClientAppointments(clientId);
      setAppointments(data);
    } catch (err) {
      console.error('Ошибка загрузки записей:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAppointments();
    }
  }, [isOpen, clientId]);

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = appointments.filter(
    (a) => (a.status === 'PENDING' || a.status === 'CONFIRMED') && a.date >= todayStr
  );
  const history = appointments.filter((a) => !upcoming.includes(a));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleConfirmCancel = async (id: number) => {
    setIsCancelling(true);
    try {
      const res = await api.cancelClientAppointment(id, cancelReason);
      showToast(res.message || 'Запись успешно отменена');
      setCancellingId(null);
      await loadAppointments();
    } catch (e) {
      showToast('Не удалось отменить запись');
    } finally {
      setIsCancelling(false);
    }
  };

  const formatRuDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✅ Подтверждена
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            ⏳ Ожидает
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">
            🏁 Завершена
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            ❌ Отменена
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-[#FAF8F5] border border-stone-200 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-900">
        
        {/* Хедер модального окна */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200/80 bg-white sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl">📅</span>
            <div>
              <h2 className="text-base font-bold text-stone-900 leading-tight">Мои записи</h2>
              <p className="text-[11px] text-stone-500">История и актуальные бронирования</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
            title="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Переключатель вкладок */}
        <div className="flex px-4 pt-3 pb-2 bg-[#FAF8F5] border-b border-stone-200/60 space-x-2">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'upcoming'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50'
            }`}
          >
            <span>Предстоящие</span>
            {upcoming.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'upcoming' ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-700'
              }`}>
                {upcoming.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50'
            }`}
          >
            <span>История</span>
            {history.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'history' ? 'bg-white/25 text-white' : 'bg-stone-100 text-stone-600'
              }`}>
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* Список записей с поддержкой прокрутки */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
          {toastMessage && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-medium text-center animate-fade-in">
              {toastMessage}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400 space-y-3">
              <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs">Загружаем ваши записи...</p>
            </div>
          ) : (
            <>
              {activeTab === 'upcoming' && (
                <>
                  {upcoming.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-3xl">
                        💅
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-stone-900">У вас нет активных записей</h3>
                        <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                          Выберите удобный день и соберите образ ногтей в нашем умном конструкторе!
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          onClose();
                          onBookNew();
                        }}
                        className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
                      >
                        💅 Записаться на процедуру
                      </button>
                    </div>
                  ) : (
                    upcoming.map((app) => (
                      <div
                        key={app.id}
                        className="bg-white border border-stone-200/90 rounded-2xl p-4 transition-all space-y-3 shadow-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-bold text-stone-900 capitalize">
                              {formatRuDate(app.date)}
                            </div>
                            <div className="text-xs text-rose-600 font-bold mt-0.5">
                              ⏰ {app.start_time} — {app.end_time}
                            </div>
                          </div>
                          <div>{getStatusBadge(app.status)}</div>
                        </div>

                        {/* Услуги */}
                        <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-100 text-xs text-stone-700 space-y-1">
                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                            Выбранные услуги:
                          </div>
                          <div className="space-y-0.5">
                            {app.services && app.services.length > 0 ? (
                              app.services.map((srv, idx) => (
                                <div key={idx} className="flex items-center space-x-1.5">
                                  <span className="text-rose-500">•</span>
                                  <span>{srv}</span>
                                </div>
                              ))
                            ) : (
                              <div>• Маникюр</div>
                            )}
                          </div>
                        </div>

                        {/* Финансы и адрес */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-100">
                          <div>
                            <span className="text-stone-400">Стоимость: </span>
                            <span className="font-bold text-stone-900 text-sm">
                              {app.total_price.toLocaleString('ru-RU')} ₽
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-500 text-right max-w-[55%] truncate" title={app.studio_address}>
                            📍 {app.studio_address.replace(/^г\.\s*[^,]+,\s*/i, '')}
                          </div>
                        </div>

                        {/* Кнопка отмены */}
                        {app.can_cancel && (
                          <div className="pt-1">
                            {cancellingId === app.id ? (
                              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3 space-y-2.5 animate-fade-in">
                                <div className="text-xs font-semibold text-rose-900">
                                  Вы уверены, что хотите отменить запись?
                                </div>
                                <select
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  className="w-full text-xs bg-white border border-rose-200 rounded-lg p-2 text-stone-900 outline-none focus:border-rose-400"
                                >
                                  <option value="Изменились планы">Изменились планы</option>
                                  <option value="Заболела / плохо себя чувствую">Заболела / плохо себя чувствую</option>
                                  <option value="Не успеваю ко времени">Не успеваю ко времени</option>
                                  <option value="Хочу записаться на другой день">Хочу записаться на другой день</option>
                                </select>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleConfirmCancel(app.id)}
                                    disabled={isCancelling}
                                    className="flex-1 py-1.5 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                  >
                                    {isCancelling ? 'Отменяем...' : 'Да, отменить'}
                                  </button>
                                  <button
                                    onClick={() => setCancellingId(null)}
                                    className="py-1.5 px-3 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-xs font-medium cursor-pointer"
                                  >
                                    Назад
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCancellingId(app.id)}
                                className="w-full py-1.5 px-3 rounded-xl border border-stone-200 hover:border-rose-300 text-stone-500 hover:text-rose-600 text-xs font-medium transition-colors text-center cursor-pointer"
                              >
                                Отменить эту запись
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}

              {activeTab === 'history' && (
                <>
                  {history.length === 0 ? (
                    <div className="py-12 text-center text-stone-400 text-xs">
                      История прошлых визитов пуста
                    </div>
                  ) : (
                    history.map((app) => (
                      <div
                        key={app.id}
                        className="bg-white border border-stone-200/90 rounded-2xl p-3.5 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-xs font-bold text-stone-800 capitalize">
                              {formatRuDate(app.date)} в {app.start_time}
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              {app.services && app.services.join(', ')}
                            </div>
                          </div>
                          <div>{getStatusBadge(app.status)}</div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-stone-600 pt-1.5 border-t border-stone-100">
                          <span className="font-semibold">{app.total_price.toLocaleString('ru-RU')} ₽</span>
                          <button
                            onClick={() => {
                              onClose();
                              onBookNew();
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                          >
                            Повторить запись →
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Подвал */}
        <div className="px-5 py-3 border-t border-stone-200 bg-white flex justify-between items-center text-xs">
          <button
            onClick={loadAppointments}
            className="text-stone-500 hover:text-stone-800 transition-colors flex items-center space-x-1 cursor-pointer font-medium"
          >
            <span>🔄</span>
            <span>Обновить</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onBookNew();
            }}
            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold shadow-xs transition-colors cursor-pointer"
          >
            💅 Новая запись
          </button>
        </div>

      </div>
    </div>
  );
};
