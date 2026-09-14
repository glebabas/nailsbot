import React from 'react';
import { CheckCircle2, Calendar, MapPin, Clock, MessageSquare, Send, Sparkles, User } from 'lucide-react';
import { Appointment } from '../types';
import { closeTelegramWebApp, triggerHaptic } from '../utils/telegram';

interface SuccessScreenProps {
  appointment: Appointment;
  onReset?: () => void;
  onNewBooking?: () => void;
  onOpenMasterView?: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({
  appointment,
  onReset,
  onNewBooking,
  onOpenMasterView,
}) => {
  const handleReset = () => {
    if (onReset) onReset();
    else if (onNewBooking) onNewBooking();
  };
  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6 text-center">
      {/* Иконка успеха */}
      <div className="relative w-20 h-20 mx-auto">
        <div className="absolute inset-0 rounded-full bg-rose-100 animate-ping opacity-75" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-rose-500 to-rose-400 text-white flex items-center justify-center shadow-lg shadow-rose-200">
          <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
          Запись подтверждена!
        </span>
        <h2 className="text-xl font-bold text-stone-900">
          Ждем вас в Екатерина Nails
        </h2>
        <p className="text-xs text-stone-500 max-w-xs mx-auto">
          Бот уже отправил подтверждение в ваш чат Telegram с деталями процедуры.
        </p>
      </div>

      {/* Карточка деталей записи */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs text-left space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <span className="text-xs text-stone-500">Номер бронирования:</span>
          <span className="text-xs font-mono font-bold text-stone-800">
            #{appointment.id}
          </span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-stone-800">
            <Calendar className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="font-semibold">{appointment.date}</span>
          </div>

          <div className="flex items-center gap-2 text-stone-800">
            <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>
              С <strong className="font-bold">{appointment.start_time}</strong> до{' '}
              <strong className="font-bold">{appointment.end_time}</strong> (
              {appointment.total_procedure_minutes} мин)
            </span>
          </div>

          <div className="flex items-center gap-2 text-stone-800">
            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Москва, ул. Арбат 10, студия 402</span>
          </div>
        </div>

        {/* Выбранные услуги */}
        <div className="pt-2 border-t border-stone-100">
          <span className="text-[11px] text-stone-400 block mb-1.5 font-medium uppercase">
            Услуги ({appointment.services.length}):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {appointment.services.map((srv, idx) => (
              <span
                key={idx}
                className="text-[10px] bg-rose-50 text-rose-800 px-2 py-0.5 rounded-md font-medium border border-rose-100"
              >
                {srv}
              </span>
            ))}
          </div>
        </div>

        {/* Стоимость */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
          <span className="text-xs text-stone-500">Сумма к оплате:</span>
          <span className="text-sm font-bold text-stone-900">
            {appointment.total_price.toLocaleString('ru-RU')} ₽
          </span>
        </div>
      </div>

      {/* Плашка напоминаний бота */}
      <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/60 text-left flex items-start gap-2.5">
        <Send className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
        <div className="text-[11px] text-stone-600 space-y-0.5">
          <span className="font-semibold text-stone-900 block">
            Автоматические напоминания
          </span>
          <p>
            За 24 часа и 12 часов до начала бот пришлет сообщение. Пожалуйста, подтвердите визит в один клик.
          </p>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="space-y-2 pt-2">
        <button
          id="btn-close-miniapp"
          type="button"
          onClick={() => {
            triggerHaptic('light');
            closeTelegramWebApp();
          }}
          className="w-full py-3 px-4 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors cursor-pointer shadow-sm"
        >
          Закрыть Mini App (вернуться в чат)
        </button>

        {onOpenMasterView && (
          <button
            id="btn-view-master-schedule"
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenMasterView();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-50 transition-colors cursor-pointer"
          >
            Открыть в Кабинете Мастера (LK)
          </button>
        )}

        <button
          id="btn-new-booking"
          type="button"
          onClick={() => {
            triggerHaptic('light');
            handleReset();
          }}
          className="text-xs text-stone-400 hover:text-stone-600 py-1 font-medium transition-colors"
        >
          Оформить еще одну запись
        </button>
      </div>
    </div>
  );
};
