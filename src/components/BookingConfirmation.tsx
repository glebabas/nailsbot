import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Sparkles,
  User,
  Phone,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { BookingState, CategorizedServices, Service } from '../types';
import { api, calculateTiming } from '../services/api';
import { triggerHaptic } from '../utils/telegram';

interface BookingConfirmationProps {
  booking: BookingState;
  services: CategorizedServices;
  onBack: () => void;
  onConfirm: () => Promise<void>;
  onUpdateClientInfo?: (name: string, phone: string) => void;
  onClientNameChange?: (name: string) => void;
  onClientPhoneChange?: (phone: string) => void;
}

export const BookingConfirmation: React.FC<BookingConfirmationProps> = ({
  booking,
  services,
  onBack,
  onConfirm,
  onUpdateClientInfo,
  onClientNameChange,
  onClientPhoneChange,
}) => {
  const [studioAddress, setStudioAddress] = useState('г. Екатеринбург, ул. Викулова 78, кв. 300');

  useEffect(() => {
    api.getStudioConfig().then((cfg) => {
      if (cfg?.studio_address) {
        setStudioAddress(cfg.studio_address);
      }
    });
  }, []);

  const updateName = (name: string) => {
    if (onClientNameChange) onClientNameChange(name);
    if (onUpdateClientInfo) onUpdateClientInfo(name, booking.clientPhone);
  };

  const updatePhone = (phone: string) => {
    if (onClientPhoneChange) onClientPhoneChange(phone);
    if (onUpdateClientInfo) onUpdateClientInfo(booking.clientName, phone);
  };

  const [submitting, setSubmitting] = useState(false);

  const allServices: Service[] = [
    ...services.removal,
    ...services.base,
    ...services.design,
    ...services.repair,
  ];

  const selectedIds = [
    booking.selectedRemovalId,
    booking.selectedBaseId,
    booking.selectedDesignId,
    ...booking.selectedRepairIds,
  ].filter((id): id is number => id !== null);

  const chosenServices = allServices.filter((s) => selectedIds.includes(s.id));
  const timing = calculateTiming(selectedIds, allServices);

  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    if (hours > 0 && m > 0) return `${hours} ч ${m} мин`;
    if (hours > 0) return `${hours} ч`;
    return `${m} мин`;
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    triggerHaptic('medium');
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-32 max-w-md mx-auto px-4 pt-3 space-y-5">
      {/* Кнопка назад */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onBack();
        }}
        className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors font-medium cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Назад к фото и комментариям</span>
      </button>

      {/* Заголовок страницы */}
      <div>
        <h2 className="text-base font-bold text-stone-900">
          Проверка параметров записи
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Пожалуйста, проверьте выбранные услуги и контакты перед подтверждением.
        </p>
      </div>

      {/* Карточка времени и локации */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-white p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-stone-700/60">
          <div className="space-y-0.5">
            <span className="text-[11px] text-rose-300 font-medium uppercase tracking-wider">
              Дата и время визита
            </span>
            <h3 className="text-lg font-bold text-white">
              {booking.targetDate} в {booking.selectedSlot?.start_time}
            </h3>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-stone-400 block">Окончание:</span>
            <span className="text-xs font-semibold text-stone-200">
              {booking.selectedSlot?.end_time}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-stone-300">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span>Длительность: {formatDuration(timing.servicesDurationMinutes)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-stone-400 font-medium">Стоимость:</span>
            <span className="text-rose-300 font-bold">{timing.totalPrice.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{studioAddress}</span>
          </div>
        </div>
      </div>

      {/* Список выбранных услуг (Чек) */}
      <section className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider pb-1 border-b border-stone-100">
          Состав процедуры
        </h3>

        <div className="space-y-2.5 divide-y divide-stone-50">
          {chosenServices.map((service) => (
            <div key={service.id} className="pt-2 first:pt-0 flex items-start justify-between gap-3 text-xs">
              <div className="space-y-0.5 pr-2">
                <span className="font-medium text-stone-800 block">
                  {service.name}
                </span>
                <span className="text-[11px] text-stone-400">
                  {service.duration_minutes > 0 ? `${service.duration_minutes} мин` : '0 мин'}
                </span>
              </div>
              <span className="font-bold text-stone-900 shrink-0">
                {service.price > 0 ? `${service.price.toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
              </span>
            </div>
          ))}
        </div>

        {/* Итоговая сумма */}
        <div className="pt-3 border-t border-stone-200 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-stone-600">Итого к оплате на месте:</span>
          <span className="text-base font-extrabold text-stone-900">
            {timing.totalPrice.toLocaleString('ru-RU')} ₽
          </span>
        </div>
      </section>

      {/* Прикрепленные фото и пожелания */}
      {(booking.photoCurrent || booking.photoRef || booking.comment) && (
        <section className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
          <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
            Фото и примечания
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {booking.photoCurrent && (
              <div className="space-y-1">
                <span className="text-[10px] text-stone-500 font-medium">Исходник ногтей</span>
                <img
                  src={booking.photoCurrent}
                  alt="Исходник"
                  className="w-full h-24 rounded-xl object-cover border border-stone-200"
                />
              </div>
            )}
            {booking.photoRef && (
              <div className="space-y-1">
                <span className="text-[10px] text-stone-500 font-medium">Референс дизайна</span>
                <img
                  src={booking.photoRef}
                  alt="Референс"
                  className="w-full h-24 rounded-xl object-cover border border-stone-200"
                />
              </div>
            )}
          </div>

          {booking.comment && (
            <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 text-xs text-stone-700">
              <span className="font-medium text-stone-900 block text-[10px] uppercase text-stone-400">
                Пожелания клиента:
              </span>
              <p className="mt-0.5 italic">"{booking.comment}"</p>
            </div>
          )}
        </section>
      )}

      {/* Контактные данные клиента */}
      <section className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
          Контактные данные
        </h3>

        <div className="space-y-2.5 text-xs">
          <div>
            <label className="text-[11px] text-stone-500 block mb-1">Имя клиента</label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50/50">
              <User className="w-3.5 h-3.5 text-stone-400" />
              <input
                type="text"
                value={booking.clientName}
                onChange={(e) => updateName(e.target.value)}
                className="bg-transparent text-xs text-stone-800 font-medium w-full focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-stone-500 block mb-1">Номер телефона (для SMS и связи)</label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50/50">
              <Phone className="w-3.5 h-3.5 text-stone-400" />
              <input
                type="tel"
                value={booking.clientPhone}
                onChange={(e) => updatePhone(e.target.value)}
                placeholder="+7 (999) 000-00-00"
                className="bg-transparent text-xs text-stone-800 font-medium w-full focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1">
            <span>Telegram аккаунт:</span>
            <span className="text-stone-700 font-medium">
              {booking.clientUsername ? `@${booking.clientUsername}` : 'Подключен через бота'}
            </span>
          </div>
        </div>
      </section>

      {/* Важное уведомление о правилах подтверждения */}
      <div className="bg-amber-50/80 border border-amber-200/80 p-3 rounded-2xl text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Система умных напоминаний бота</span>
        </div>
        <p className="text-stone-600 text-[11px] leading-relaxed">
          За 24 часа и за 12 часов бот пришлет в чат Telegram интерактивное сообщение с кнопками подтверждения. При неподтверждении за 8 часов бронь автоматически аннулируется, и окно предлагается клиентам из листа ожидания.
        </p>
      </div>

      {/* ПЛАВАЮЩИЙ НИЖНИЙ БАР */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/80 p-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] text-stone-500 block">К оплате:</span>
            <span className="text-base font-extrabold text-stone-900">
              {timing.totalPrice.toLocaleString('ru-RU')} ₽
            </span>
          </div>

          <button
            id="btn-confirm-appointment"
            type="button"
            disabled={submitting}
            onClick={handleFinalSubmit}
            className="px-6 py-3 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 shadow-sm bg-rose-600 text-white hover:bg-rose-700 active:scale-98 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Записываем...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Подтвердить запись</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
