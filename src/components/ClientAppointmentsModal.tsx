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
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            ✅ Подтверждена
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ⏳ Ожидает подтверждения
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            🏁 Завершена
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            ❌ Отменена
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        
        {/* Хедер модального окна */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl">📅</span>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Мои записи</h2>
              <p className="text-xs text-slate-400">История и актуальные бронирования</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Переключатель вкладок */}
        <div className="flex px-4 pt-3 pb-2 bg-slate-900 border-b border-slate-800/60 space-x-2">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'upcoming'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>Предстоящие</span>
            {upcoming.length > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {upcoming.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'history'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>История</span>
            {history.length > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
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
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs">Загружаем ваши записи...</p>
            </div>
          ) : (
            <>
              {activeTab === 'upcoming' && (
                <>
                  {upcoming.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center text-3xl">
                        💅
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-white">У вас нет активных записей</h3>
                        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                          Выберите удобный день и соберите образ ногтей в нашем умном конструкторе!
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          onClose();
                          onBookNew();
                        }}
                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold text-sm shadow-lg shadow-rose-500/20 transition-all"
                      >
                        💅 Записаться на процедуру
                      </button>
                    </div>
                  ) : (
                    upcoming.map((app) => (
                      <div
                        key={app.id}
                        className="bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 rounded-xl p-4 transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-bold text-white capitalize">
                              {formatRuDate(app.date)}
                            </div>
                            <div className="text-xs text-rose-400 font-semibold mt-0.5">
                              ⏰ {app.start_time} — {app.end_time}
                            </div>
                          </div>
                          <div>{getStatusBadge(app.status)}</div>
                        </div>

                        {/* Услуги */}
                        <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/60 text-xs text-slate-300 space-y-1">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Выбранные услуги:
                          </div>
                          <div className="space-y-0.5">
                            {app.services && app.services.length > 0 ? (
                              app.services.map((srv, idx) => (
                                <div key={idx} className="flex items-center space-x-1.5">
                                  <span className="text-rose-400">•</span>
                                  <span>{srv}</span>
                                </div>
                              ))
                            ) : (
                              <div>• Маникюр</div>
                            )}
                          </div>
                        </div>

                        {/* Финансы и адрес */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-700/40">
                          <div>
                            <span className="text-slate-400">Стоимость: </span>
                            <span className="font-bold text-white text-sm">
                              {app.total_price.toLocaleString('ru-RU')} ₽
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 text-right max-w-[55%] truncate" title={app.studio_address}>
                            📍 {app.studio_address}
                          </div>
                        </div>

                        {/* Кнопка отмены */}
                        {app.can_cancel && (
                          <div className="pt-2">
                            {cancellingId === app.id ? (
                              <div className="bg-slate-900 border border-rose-500/30 rounded-lg p-3 space-y-2.5 animate-fade-in">
                                <div className="text-xs font-semibold text-rose-300">
                                  Вы уверены, что хотите отменить запись?
                                </div>
                                <select
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-rose-500"
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
                                    className="flex-1 py-1.5 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold disabled:opacity-50"
                                  >
                                    {isCancelling ? 'Отменяем...' : 'Да, отменить'}
                                  </button>
                                  <button
                                    onClick={() => setCancellingId(null)}
                                    className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                                  >
                                    Назад
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCancellingId(app.id)}
                                className="w-full py-2 px-3 rounded-lg border border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 text-xs font-medium transition-colors text-center"
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
                    <div className="py-12 text-center text-slate-400 text-xs">
                      История прошлых визитов пуста
                    </div>
                  ) : (
                    history.map((app) => (
                      <div
                        key={app.id}
                        className="bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 space-y-2 opacity-90"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-xs font-semibold text-slate-300 capitalize">
                              {formatRuDate(app.date)} в {app.start_time}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {app.services && app.services.join(', ')}
                            </div>
                          </div>
                          <div>{getStatusBadge(app.status)}</div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                          <span>Сумма: {app.total_price.toLocaleString('ru-RU')} ₽</span>
                          <button
                            onClick={() => {
                              onClose();
                              onBookNew();
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
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
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex justify-between items-center text-xs">
          <button
            onClick={loadAppointments}
            className="text-slate-400 hover:text-white transition-colors flex items-center space-x-1"
          >
            <span>🔄</span>
            <span>Обновить</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onBookNew();
            }}
            className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-semibold transition-colors"
          >
            💅 Новая запись
          </button>
        </div>

      </div>
    </div>
  );
};
