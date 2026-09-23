import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Sparkles, ShieldCheck, ArrowLeft, AlertCircle, BellRing, Check } from 'lucide-react';
import { AvailableSlot, CalculatedTiming, CategorizedServices } from '../types';
import { api } from '../services/api';
import { triggerHaptic } from '../utils/telegram';

interface SlotSelectorProps {
  selectedServiceIds: number[];
  selectedDate?: string;
  targetDate?: string;
  selectedSlot: AvailableSlot | null;
  onSelectDate?: (dateStr: string) => void;
  onDateChange?: (dateStr: string) => void;
  onSelectSlot: (slot: AvailableSlot) => void;
  onBack: () => void;
  onProceedToPhotos?: () => void;
  onProceed?: () => void;
  services?: CategorizedServices;
}

export const SlotSelector: React.FC<SlotSelectorProps> = ({
  selectedServiceIds,
  selectedDate: propSelectedDate,
  targetDate,
  selectedSlot,
  onSelectDate,
  onDateChange,
  onSelectSlot,
  onBack,
  onProceedToPhotos,
  onProceed,
}) => {
  const selectedDate = propSelectedDate || targetDate || new Date().toISOString().split('T')[0];
  const handleDateSelection = (d: string) => {
    if (onSelectDate) onSelectDate(d);
    if (onDateChange) onDateChange(d);
  };
  const handleProceed = () => {
    if (onProceedToPhotos) onProceedToPhotos();
    else if (onProceed) onProceed();
  };
  const [loading, setLoading] = useState<boolean>(true);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [isDayOff, setIsDayOff] = useState<boolean>(false);
  const [timing, setTiming] = useState<CalculatedTiming | null>(null);
  const [waitlistJoined, setWaitlistJoined] = useState<boolean>(false);

  // Генерация ближайших 14 дней для горизонтальной ленты
  const datesList = React.useMemo(() => {
    const list: {
      dateStr: string;
      dayOfWeek: string;
      dayNum: number;
      monthStr: string;
      isToday: boolean;
      isTomorrow: boolean;
      isSunday: boolean;
    }[] = [];

    const now = new Date();
    const daysRu = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const monthsRu = [
      'янв', 'фев', 'мар', 'апр', 'май', 'июн',
      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
    ];

    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      list.push({
        dateStr,
        dayOfWeek: daysRu[d.getDay()],
        dayNum: d.getDate(),
        monthStr: monthsRu[d.getMonth()],
        isToday: i === 0,
        isTomorrow: i === 1,
        isSunday: d.getDay() === 0,
      });
    }

    return list;
  }, []);

  // Запрос слотов при смене даты или состава услуг
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    api
      .getAvailableSlots(1, selectedDate, selectedServiceIds)
      .then((res) => {
        if (!isCancelled) {
          setSlots(res.slots);
          setIsDayOff(res.isDayOff);
          setTiming(res.timing);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Ошибка загрузки слотов:', err);
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedDate, selectedServiceIds]);

  // Разделение доступных слотов на Утро, День, Вечер
  const morningSlots = slots.filter((s) => s.start_minutes < 12 * 60);
  const daySlots = slots.filter((s) => s.start_minutes >= 12 * 60 && s.start_minutes < 17 * 60);
  const eveningSlots = slots.filter((s) => s.start_minutes >= 17 * 60);

  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    if (hours > 0 && m > 0) return `${hours} ч ${m} мин`;
    if (hours > 0) return `${hours} ч`;
    return `${m} мин`;
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
        <span>Изменить выбранные услуги</span>
      </button>

      {/* Информационный баннер умного расчета */}
      {timing && (
        <div className="bg-gradient-to-br from-rose-50 to-pink-50/60 border border-rose-200/80 p-3.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-600 font-medium">Расчетное время процедуры:</span>
            <span className="font-bold text-rose-600 text-sm">
              {formatDuration(timing.servicesDurationMinutes)}
            </span>
          </div>
        </div>
      )}

      {/* ГОРИЗОНТАЛЬНЫЙ КАЛЕНДАРЬ */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
            Выберите дату визита
          </h3>
          <span className="text-[11px] text-stone-500">
            {datesList.find((d) => d.dateStr === selectedDate)?.monthStr}. 2026
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-4 px-4 scroll-smooth">
          {datesList.map((item) => {
            const isSelected = selectedDate === item.dateStr;

            return (
              <button
                key={item.dateStr}
                id={`date-chip-${item.dateStr}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  handleDateSelection(item.dateStr);
                }}
                className={`flex-shrink-0 w-14 py-2.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-rose-500 text-white border-rose-500 shadow-sm ring-2 ring-rose-200'
                    : item.isSunday
                    ? 'bg-stone-50 text-stone-400 border-stone-200/50'
                    : 'bg-white text-stone-800 border-stone-200/80 hover:border-stone-300'
                }`}
              >
                <span
                  className={`text-[10px] font-medium uppercase ${
                    isSelected ? 'text-rose-100' : item.isSunday ? 'text-stone-400' : 'text-stone-500'
                  }`}
                >
                  {item.isToday ? 'Сег' : item.isTomorrow ? 'Зав' : item.dayOfWeek}
                </span>
                <span className="text-sm font-bold mt-0.5 leading-none">
                  {item.dayNum}
                </span>
                <span
                  className={`text-[9px] mt-1 font-medium ${
                    isSelected ? 'text-white' : item.isSunday ? 'text-red-400' : 'text-stone-400'
                  }`}
                >
                  {item.isSunday ? 'вых' : item.monthStr}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ДОСТУПНЫЕ СЛОТЫ ВРЕМЕНИ */}
      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
            Свободные окна мастера
          </h3>
          {!loading && !isDayOff && (
            <span className="text-[11px] text-stone-500">
              Найдено: {slots.length}
            </span>
          )}
        </div>

        {/* Лоадер */}
        {loading && (
          <div className="p-8 text-center bg-white rounded-2xl border border-stone-200/80 space-y-2">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-stone-500">
              Сверяем график мастера и ищем непрерывные свободные окна...
            </p>
          </div>
        )}

        {/* День отдыха */}
        {!loading && isDayOff && (
          <div className="p-5 text-center bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
            <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center mx-auto">
              ☕
            </div>
            <h4 className="text-xs font-semibold text-stone-800">
              Выходной день мастера
            </h4>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              В этот день мастер отдыхает и пополняет запасы материалов. Пожалуйста, выберите другую дату на панели выше.
            </p>
          </div>
        )}

        {/* Нет окон подходящей длины */}
        {!loading && !isDayOff && slots.length === 0 && (
          <div className="p-5 text-center bg-rose-50/50 rounded-2xl border border-rose-200/60 space-y-3">
            <AlertCircle className="w-7 h-7 text-rose-500 mx-auto" />
            <div>
              <h4 className="text-xs font-semibold text-stone-900">
                Все свободные окна заняты
              </h4>
              <p className="text-xs text-stone-600 mt-1">
                На выбранную дату нет свободного промежутка длительностью{' '}
                {timing ? formatDuration(timing.totalDurationMinutes) : '2+ ч'}.
              </p>
            </div>

            {/* Запись в Лист ожидания (Waitlist) */}
            <button
              id="btn-join-waitlist"
              type="button"
              onClick={() => {
                triggerHaptic('success');
                setWaitlistJoined(true);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-stone-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {waitlistJoined ? '✓ Вы в листе ожидания на этот день!' : 'Встать в лист ожидания (T-8h отмены)'}
              </span>
            </button>
            {waitlistJoined && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded-lg font-medium">
                Если кто-то отменит запись за 24 или 8 часов, бот первым делом пришлет вам уведомление!
              </p>
            )}
          </div>
        )}

        {/* Сетка доступных слотов по периодам */}
        {!loading && !isDayOff && slots.length > 0 && (
          <div className="space-y-4">
            {/* Утренние слоты */}
            {morningSlots.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-stone-400 flex items-center gap-1">
                  🌅 Утро (до 12:00)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {morningSlots.map((slot) => {
                    const isSelected = selectedSlot?.start_time === slot.start_time;
                    return (
                      <button
                        key={slot.start_time}
                        id={`slot-btn-${slot.start_time.replace(':', '-')}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectSlot(slot);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                            : 'bg-white border-stone-200/80 hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">
                            {slot.start_time}
                          </span>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span
                          className={`text-[10px] block mt-0.5 ${
                            isSelected ? 'text-rose-100' : 'text-stone-400'
                          }`}
                        >
                          до {slot.end_time}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Дневные слоты */}
            {daySlots.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-stone-400 flex items-center gap-1">
                  ☀️ День (12:00 – 17:00)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {daySlots.map((slot) => {
                    const isSelected = selectedSlot?.start_time === slot.start_time;
                    return (
                      <button
                        key={slot.start_time}
                        id={`slot-btn-${slot.start_time.replace(':', '-')}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectSlot(slot);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                            : 'bg-white border-stone-200/80 hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">
                            {slot.start_time}
                          </span>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span
                          className={`text-[10px] block mt-0.5 ${
                            isSelected ? 'text-rose-100' : 'text-stone-400'
                          }`}
                        >
                          до {slot.end_time}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Вечерние слоты */}
            {eveningSlots.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-stone-400 flex items-center gap-1">
                  🌙 Вечер (после 17:00)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {eveningSlots.map((slot) => {
                    const isSelected = selectedSlot?.start_time === slot.start_time;
                    return (
                      <button
                        key={slot.start_time}
                        id={`slot-btn-${slot.start_time.replace(':', '-')}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectSlot(slot);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                            : 'bg-white border-stone-200/80 hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">
                            {slot.start_time}
                          </span>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span
                          className={`text-[10px] block mt-0.5 ${
                            isSelected ? 'text-rose-100' : 'text-stone-400'
                          }`}
                        >
                          до {slot.end_time}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ПЛАВАЮЩИЙ НИЖНИЙ БАР */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/80 p-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] text-stone-500 block">
              {selectedSlot ? 'Выбранное время:' : 'Выберите свободное окно:'}
            </span>
            <span className="text-sm font-bold text-stone-900">
              {selectedSlot
                ? `${selectedDate} в ${selectedSlot.start_time}`
                : 'Время не выбрано'}
            </span>
          </div>

          <button
            id="btn-proceed-to-photos"
            type="button"
            disabled={!selectedSlot}
            onClick={() => {
              triggerHaptic('medium');
              handleProceed();
            }}
            className={`px-5 py-3 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 shadow-sm ${
              selectedSlot
                ? 'bg-stone-900 text-white hover:bg-stone-800 active:scale-98 cursor-pointer'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}
          >
            <span>К загрузке фото</span>
            <span className="text-stone-300">→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
