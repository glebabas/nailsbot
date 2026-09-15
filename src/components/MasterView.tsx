import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  ShieldCheck,
  User,
  Phone,
  MessageCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Sparkles,
  Camera,
  Image as ImageIcon,
  DollarSign,
  Filter,
  CalendarDays,
  ListTodo,
} from 'lucide-react';
import { Appointment, StudioConfig } from '../types';
import { api, getStoredAppointments } from '../services/api';
import { triggerHaptic, getTelegramUser } from '../utils/telegram';
import { ScheduleSetup } from './ScheduleSetup';
import { MasterSettings } from './MasterSettings';
import { Settings } from 'lucide-react';

export const MasterView: React.FC = () => {
  const tgUser = getTelegramUser();
  const [activeTab, setActiveTab] = useState<'appointments' | 'schedule' | 'settings'>('appointments');
  const [studioConfig, setStudioConfig] = useState<StudioConfig | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [modalPhoto, setModalPhoto] = useState<string | null>(null);

  const refreshAppointments = async () => {
    const fetched = await api.getMasterDaySchedule(1, selectedDate);
    setAppointments(fetched);
  };

  useEffect(() => {
    refreshAppointments();
    api.getStudioConfig().then(setStudioConfig);
  }, [selectedDate]);

  const filteredAppointments = appointments.filter((a) => a.date === selectedDate);
  const totalRevenue = filteredAppointments
    .filter((a) => a.status !== 'cancelled')
    .reduce((sum, a) => sum + a.total_price, 0);

  const totalProcedureMinutes = filteredAppointments
    .filter((a) => a.status !== 'cancelled')
    .reduce((sum, a) => sum + a.total_procedure_minutes, 0);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
  };

  const handleStatusChange = async (appId: number, newStatus: Appointment['status']) => {
    triggerHaptic('medium');
    const updated = appointments.map((a) =>
      a.id === appId ? { ...a, status: newStatus } : a
    );
    setAppointments(updated);
    
    await api.updateAppointmentStatus(appId, newStatus);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-24">
      {/* Шапка мастера */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-sm border border-rose-200 shrink-0 shadow-xs">
            {studioConfig?.avatar_url ? (
              <img src={studioConfig.avatar_url} alt="Аватарка" className="w-full h-full object-cover" />
            ) : (
              <span>{studioConfig?.studio_name ? studioConfig.studio_name.charAt(0).toUpperCase() : '💅'}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-stone-900 truncate">
                {studioConfig?.studio_name || 'Кабинет мастера'}
              </h2>
              <span className="bg-rose-100 text-rose-800 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                Мастер
              </span>
            </div>
            <p className="text-[11px] text-stone-500 truncate">
              {studioConfig?.studio_address || (tgUser.firstName ? `${tgUser.firstName} • Студия` : 'Стерилизация, референсы и график')}
            </p>
          </div>
        </div>
      </div>

      {/* Вкладки: Записи / График / Настройки */}
      <div className="bg-stone-100/90 p-1 rounded-2xl flex border border-stone-200/60 shadow-2xs gap-1">
        <button
          id="master-tab-appointments"
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('appointments');
          }}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'appointments'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <ListTodo className="w-3.5 h-3.5 text-rose-500" />
          <span>Записи</span>
        </button>

        <button
          id="master-tab-schedule"
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('schedule');
          }}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'schedule'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5 text-rose-500" />
          <span>График</span>
        </button>

        <button
          id="master-tab-settings"
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('settings');
          }}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Settings className="w-3.5 h-3.5 text-rose-500" />
          <span>Настройки</span>
        </button>
      </div>

      {/* Контент активной вкладки */}
      {activeTab === 'settings' ? (
        <MasterSettings onConfigUpdated={(conf) => setStudioConfig(conf)} />
      ) : activeTab === 'schedule' ? (
        <ScheduleSetup
          masterId={1}
          onScheduleUpdated={refreshAppointments}
        />
      ) : (
        <>
          {/* Быстрые сводки на день */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs">
              <span className="text-[10px] text-stone-400 block font-medium">Записей</span>
              <span className="text-base font-bold text-stone-900 mt-0.5 block">
                {filteredAppointments.length}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs">
              <span className="text-[10px] text-stone-400 block font-medium">В работе</span>
              <span className="text-base font-bold text-rose-600 mt-0.5 block">
                {formatDuration(totalProcedureMinutes)}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs">
              <span className="text-[10px] text-stone-400 block font-medium">Выручка</span>
              <span className="text-base font-bold text-emerald-600 mt-0.5 block">
                {totalRevenue.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>

          {/* Выбор даты для просмотра */}
          <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs">
            <Calendar className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="text-xs font-semibold text-stone-700 shrink-0">
              Дата расписания:
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-stone-50 text-xs text-stone-800 border border-stone-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-rose-500 font-semibold"
            />
          </div>

          {/* Список клиентов и таймлайн записей */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
                Клиенты на {selectedDate}
              </h3>
              <span className="text-[11px] text-stone-400">
                {filteredAppointments.length} сеанс(-а)
              </span>
            </div>

            {filteredAppointments.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl border border-stone-200 text-center space-y-1">
                <Calendar className="w-6 h-6 text-stone-300 mx-auto" />
                <p className="text-xs font-medium text-stone-700">
                  На этот день записей пока нет
                </p>
                <p className="text-[11px] text-stone-400">
                  Все слоты свободны для бронирования клиентами
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAppointments.map((app) => {
                  const isConfirmed = app.status === 'confirmed';
                  const isCancelled = app.status === 'cancelled';

                  return (
                    <div
                      key={app.id}
                      id={`master-app-card-${app.id}`}
                      className={`bg-white p-4 rounded-2xl border transition-all shadow-xs space-y-3 ${
                        isCancelled
                          ? 'border-stone-200 opacity-60 bg-stone-50'
                          : isConfirmed
                          ? 'border-emerald-200/80 ring-1 ring-emerald-100'
                          : 'border-amber-200/80 ring-1 ring-amber-100'
                      }`}
                    >
                      {/* Верхняя строка: Время и статус */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-stone-900">
                            {app.start_time} — {app.end_time}
                          </span>
                          <span className="text-[11px] text-stone-400 font-medium">
                            ({formatDuration(app.total_duration_minutes)})
                          </span>
                        </div>

                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isConfirmed
                              ? 'bg-emerald-100 text-emerald-800'
                              : isCancelled
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isConfirmed
                            ? 'Подтвержден'
                            : isCancelled
                            ? 'Отменен'
                            : 'Ожидает'}
                        </span>
                      </div>

                      {/* Инфо о клиенте */}
                      <div className="bg-stone-50 p-3 rounded-xl space-y-1.5 border border-stone-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-stone-400" />
                            {app.client_name}
                          </span>
                          <span className="text-xs font-bold text-stone-900">
                            {app.total_price.toLocaleString('ru-RU')} ₽
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-stone-500">
                          {app.client_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-stone-400" />
                              {app.client_phone}
                            </span>
                          )}
                          {app.client_username && (
                            <span className="flex items-center gap-1 text-rose-600 font-medium">
                              <MessageCircle className="w-3 h-3" />@{app.client_username}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Выбранные этапы услуги */}
                      <div>
                        <span className="text-[11px] font-medium text-stone-400 block mb-1">
                          Этапы процедуры:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {app.services.map((svc, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-[10px] font-medium bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md"
                            >
                              {svc}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Блок фотографий ногтей и референса */}
                      {(app.photo_current || app.photo_ref) && (
                        <div className="pt-1">
                          <span className="text-[11px] font-medium text-stone-400 block mb-1">
                            Фотографии клиента:
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {app.photo_current && (
                              <div
                                onClick={() => setModalPhoto(app.photo_current || null)}
                                className="relative group rounded-xl overflow-hidden border border-stone-200 cursor-pointer h-24 bg-stone-100"
                              >
                                <img
                                  src={app.photo_current}
                                  alt="Текущее состояние"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <span className="absolute bottom-1 left-1 bg-stone-900/70 backdrop-blur-xs text-[9px] text-white px-1.5 py-0.5 rounded-md">
                                  Состояние
                                </span>
                              </div>
                            )}
                            {app.photo_ref && (
                              <div
                                onClick={() => setModalPhoto(app.photo_ref || null)}
                                className="relative group rounded-xl overflow-hidden border border-stone-200 cursor-pointer h-24 bg-stone-100"
                              >
                                <img
                                  src={app.photo_ref}
                                  alt="Референс дизайна"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <span className="absolute bottom-1 left-1 bg-rose-950/80 backdrop-blur-xs text-[9px] text-white px-1.5 py-0.5 rounded-md">
                                  Желаемый дизайн
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Комментарий */}
                      {app.comment && (
                        <div className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded-lg italic border border-stone-100">
                          «{app.comment}»
                        </div>
                      )}

                      {/* Буфер стерилизации после этой процедуры */}
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50/70 px-2.5 py-1.5 rounded-xl border border-emerald-100/60">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Буфер стерилизации: <b>+{app.sterilization_buffer_minutes} мин</b> после клиента
                        </span>
                      </div>

                      {/* Кнопки управления статусом */}
                      <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
                        {!isConfirmed && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(app.id, 'confirmed')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Подтвердить
                          </button>
                        )}
                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(app.id, 'cancelled')}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-2 px-3 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer border border-rose-200/50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Отменить
                          </button>
                        )}
                        {isConfirmed && (
                          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Запись в графике
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Модальное окно просмотра фото */}
      {modalPhoto && (
        <div
          onClick={() => setModalPhoto(null)}
          className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="max-w-sm w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-2">
            <img
              src={modalPhoto}
              alt="Увеличенное фото"
              className="w-full h-auto rounded-xl object-contain max-h-[75vh]"
            />
            <p className="text-center text-xs text-stone-500 mt-2 pb-1">
              Нажмите в любом месте, чтобы закрыть
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
