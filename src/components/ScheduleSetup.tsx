import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  ShieldCheck,
  Coffee,
  Copy,
  Wand2,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Save,
  CheckCircle2,
} from 'lucide-react';
import {
  SchedulePattern,
  ScheduleTemplateSettings,
  MasterMonthOverview,
  MonthDaySchedule,
  MasterScheduleDay,
} from '../types';
import { api } from '../services/api';
import { triggerHaptic } from '../utils/telegram';

interface ScheduleSetupProps {
  masterId?: number;
  onScheduleUpdated?: () => void;
}

export const ScheduleSetup: React.FC<ScheduleSetupProps> = ({
  masterId = 1,
  onScheduleUpdated,
}) => {
  // Текущий выбранный месяц YYYY-MM
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  );

  const [monthData, setMonthData] = useState<MasterMonthOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDayDate, setSelectedDayDate] = useState<string>(
    today.toISOString().split('T')[0]
  );

  // Параметры формы шаблона
  const [pattern, setPattern] = useState<SchedulePattern>('5_2');
  const [startTime, setStartTime] = useState<string>('10:00');
  const [endTime, setEndTime] = useState<string>('20:00');
  const [hasLunchBreak, setHasLunchBreak] = useState<boolean>(true);
  const [breakStart, setBreakStart] = useState<string>('14:00');
  const [breakEnd, setBreakEnd] = useState<string>('15:00');
  const [sterilizationBuffer, setSterilizationBuffer] = useState<number>(15);

  // Статус сохранения
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Загрузка данных месяца
  const loadMonthData = async (monthStr: string) => {
    setLoading(true);
    try {
      const data = await api.getMasterMonthSchedule(masterId, monthStr);
      setMonthData(data);
    } catch (e) {
      console.error('Ошибка загрузки графика:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthData(currentMonth);
  }, [currentMonth]);

  // Навигация по месяцам
  const handlePrevMonth = () => {
    triggerHaptic('light');
    const [y, m] = currentMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setCurrentMonth(
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  const handleNextMonth = () => {
    triggerHaptic('light');
    const [y, m] = currentMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    setCurrentMonth(
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  // Месяц на русском языке
  const monthTitle = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const dateObj = new Date(y, m - 1, 1);
    const monthName = dateObj.toLocaleString('ru-RU', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${y}`;
  }, [currentMonth]);

  // Выбранный день для детального редактирования
  const selectedDayInfo = useMemo(() => {
    if (!monthData) return null;
    return monthData.days.find((d) => d.date === selectedDayDate) || null;
  }, [monthData, selectedDayDate]);

  // Локальные стейты формы выбранного дня
  const [dayIsWorking, setDayIsWorking] = useState<boolean>(true);
  const [dayStart, setDayStart] = useState<string>('10:00');
  const [dayEnd, setDayEnd] = useState<string>('20:00');
  const [dayBreakStart, setDayBreakStart] = useState<string>('14:00');
  const [dayBreakEnd, setDayBreakEnd] = useState<string>('15:00');

  useEffect(() => {
    if (selectedDayInfo) {
      setDayIsWorking(selectedDayInfo.is_working_day);
      setDayStart(selectedDayInfo.start_time);
      setDayEnd(selectedDayInfo.end_time);
      setDayBreakStart(selectedDayInfo.break_start || '14:00');
      setDayBreakEnd(selectedDayInfo.break_end || '15:00');
    }
  }, [selectedDayInfo]);

  // Сохранение одиночного дня
  const handleSaveDay = async () => {
    triggerHaptic('medium');
    const payload: MasterScheduleDay = {
      date: selectedDayDate,
      is_working_day: dayIsWorking,
      start_time: dayStart,
      end_time: dayEnd,
      break_start: hasLunchBreak ? dayBreakStart : undefined,
      break_end: hasLunchBreak ? dayBreakEnd : undefined,
      sterilization_buffer_minutes: sterilizationBuffer,
    };

    await api.setDaySchedule(masterId, payload);
    await loadMonthData(currentMonth);
    onScheduleUpdated?.();

    setSaveSuccessMsg(`График на ${selectedDayDate} сохранён`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Скопировать часы выбранного дня на все рабочие дни месяца
  const handleCopyToAllWorkingDays = async () => {
    if (!monthData) return;
    triggerHaptic('medium');

    const workingDays = monthData.days.filter((d) => d.is_working_day);
    for (const d of workingDays) {
      await api.setDaySchedule(masterId, {
        date: d.date,
        is_working_day: true,
        start_time: dayStart,
        end_time: dayEnd,
        break_start: hasLunchBreak ? dayBreakStart : undefined,
        break_end: hasLunchBreak ? dayBreakEnd : undefined,
        sterilization_buffer_minutes: sterilizationBuffer,
      });
    }

    await loadMonthData(currentMonth);
    onScheduleUpdated?.();
    setSaveSuccessMsg(`Параметры скопированы на все (${workingDays.length}) рабочие дни`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Применить шаблон на весь текущий месяц
  const handleApplyTemplate = async () => {
    triggerHaptic('heavy');
    const settings: ScheduleTemplateSettings = {
      month: currentMonth,
      pattern: pattern,
      startTime: startTime,
      endTime: endTime,
      breakStart: hasLunchBreak ? breakStart : '',
      breakEnd: hasLunchBreak ? breakEnd : '',
      sterilizationBufferMinutes: sterilizationBuffer,
    };

    const res = await api.applyScheduleTemplate(settings, masterId);
    await loadMonthData(currentMonth);
    onScheduleUpdated?.();

    setSaveSuccessMsg(res.message || 'Шаблон успешно применен!');
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Дни недели шапки календаря
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Вычисление смещения первого дня месяца (0 = Пн, 6 = Вс)
  const firstDayOffset = useMemo(() => {
    if (!monthData || monthData.days.length === 0) return 0;
    return monthData.days[0].day_of_week;
  }, [monthData]);

  return (
    <div className="space-y-5">
      {/* Оповещение об успешном сохранении */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* 1. Блок навигации по месяцу и общая статистика */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold block">
              Период графика
            </span>
            <h2 className="text-base font-bold text-stone-900">{monthTitle}</h2>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
            <button
              id="prev-month-btn"
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white rounded-lg text-stone-600 transition-colors cursor-pointer"
              title="Предыдущий месяц"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="next-month-btn"
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white rounded-lg text-stone-600 transition-colors cursor-pointer"
              title="Следующий месяц"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Сводные метрики месяца */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-100 text-center">
          <div className="bg-stone-50 p-2 rounded-xl">
            <span className="text-[10px] text-stone-400 font-medium block">Рабочих смен</span>
            <span className="text-sm font-bold text-stone-900 mt-0.5 block">
              {monthData?.total_working_days ?? 0}
            </span>
          </div>
          <div className="bg-stone-50 p-2 rounded-xl">
            <span className="text-[10px] text-stone-400 font-medium block">Записей</span>
            <span className="text-sm font-bold text-rose-600 mt-0.5 block">
              {monthData?.total_appointments ?? 0}
            </span>
          </div>
          <div className="bg-stone-50 p-2 rounded-xl">
            <span className="text-[10px] text-stone-400 font-medium block">План выручки</span>
            <span className="text-sm font-bold text-emerald-600 mt-0.5 block">
              {(monthData?.total_revenue ?? 0).toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>
      </div>

      {/* 2. Интерактивная календарная сетка на месяц */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Сетка смен на месяц
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Смена
            </span>
            <span className="flex items-center gap-1 text-stone-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-stone-300" /> Выходной
            </span>
          </div>
        </div>

        {/* Заголовки дней недели */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-stone-400 pb-1">
          {weekDays.map((w, idx) => (
            <div key={w} className={idx >= 5 ? 'text-rose-400' : ''}>
              {w}
            </div>
          ))}
        </div>

        {/* Ячейки дней */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Пустые ячейки смещения */}
          {Array.from({ length: firstDayOffset }).map((_, idx) => (
            <div key={`offset-${idx}`} className="min-h-[56px] rounded-xl bg-transparent" />
          ))}

          {/* Дни месяца */}
          {monthData?.days.map((day) => {
            const isSelected = day.date === selectedDayDate;
            const isWorking = day.is_working_day;
            const hasApps = day.appointments_count > 0;

            return (
              <button
                key={day.date}
                id={`calendar-day-${day.day_number}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedDayDate(day.date);
                }}
                className={`min-h-[56px] rounded-xl flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer relative ${
                  isSelected
                    ? 'ring-2 ring-rose-500 bg-rose-50/90 shadow-xs'
                    : isWorking
                    ? 'bg-emerald-50/70 hover:bg-emerald-100/60 text-emerald-950 border border-emerald-200/60'
                    : 'bg-stone-100/80 hover:bg-stone-200/50 text-stone-400 border border-stone-200/40'
                }`}
              >
                <div className="flex items-center justify-between w-full px-0.5">
                  <span
                    className={`text-xs font-bold leading-none ${
                      isSelected ? 'text-rose-700' : isWorking ? 'text-stone-800' : 'text-stone-400'
                    }`}
                  >
                    {day.day_number}
                  </span>
                  {hasApps && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Есть записи" />
                  )}
                </div>

                <span className="text-[9px] font-semibold leading-none truncate w-full text-center my-0.5">
                  {isWorking ? `${day.start_time.split(':')[0]}-${day.end_time.split(':')[0]}` : 'Вых.'}
                </span>

                {hasApps ? (
                  <span className="text-[8px] font-bold text-rose-600 bg-rose-100/90 px-1 rounded-sm leading-none py-0.5">
                    {day.appointments_count} зап.
                  </span>
                ) : (
                  <span className="h-1.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Детальная настройка выбранного дня */}
      {selectedDayInfo && (
        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-500" />
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                День: {selectedDayDate}
              </h3>
            </div>

            {/* Переключатель Рабочий / Выходной */}
            <div className="flex bg-stone-100 p-0.5 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayIsWorking(true);
                }}
                className={`px-3 py-1 rounded-lg transition-all ${
                  dayIsWorking
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Рабочий
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayIsWorking(false);
                }}
                className={`px-3 py-1 rounded-lg transition-all ${
                  !dayIsWorking
                    ? 'bg-stone-700 text-white shadow-xs font-semibold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Выходной
              </button>
            </div>
          </div>

          {dayIsWorking && (
            <div className="space-y-3 pt-1">
              {/* Время начала и окончания */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-stone-600 block mb-1">
                    Начало смены:
                  </label>
                  <input
                    type="time"
                    value={dayStart}
                    onChange={(e) => setDayStart(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-stone-600 block mb-1">
                    Конец смены:
                  </label>
                  <input
                    type="time"
                    value={dayEnd}
                    onChange={(e) => setDayEnd(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Обеденный перерыв дня */}
              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-900 text-xs font-medium">
                    <Coffee className="w-3.5 h-3.5 text-amber-600" />
                    <span>Обед мастера</span>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasLunchBreak}
                      onChange={(e) => setHasLunchBreak(e.target.checked)}
                      className="accent-amber-600 rounded"
                    />
                    <span>Включить</span>
                  </label>
                </div>

                {hasLunchBreak && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-amber-700 block mb-0.5">С</span>
                      <input
                        type="time"
                        value={dayBreakStart}
                        onChange={(e) => setDayBreakStart(e.target.value)}
                        className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-700 block mb-0.5">До</span>
                      <input
                        type="time"
                        value={dayBreakEnd}
                        onChange={(e) => setDayBreakEnd(e.target.value)}
                        className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Буфер стерилизации */}
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-stone-600 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Стерилизация между клиентами:
                </span>
                <select
                  value={sterilizationBuffer}
                  onChange={(e) => setSterilizationBuffer(Number(e.target.value))}
                  className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs font-semibold text-stone-800"
                >
                  <option value={10}>10 мин</option>
                  <option value={15}>15 мин (стандарт)</option>
                  <option value={20}>20 мин</option>
                  <option value={30}>30 мин</option>
                </select>
              </div>
            </div>
          )}

          {/* Кнопки действий для выбранного дня */}
          <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
            <button
              id="save-single-day-btn"
              type="button"
              onClick={handleSaveDay}
              className="flex-1 bg-stone-900 text-white text-xs font-semibold py-2.5 px-3 rounded-xl hover:bg-stone-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Сохранить день</span>
            </button>

            {dayIsWorking && (
              <button
                id="copy-to-all-working-btn"
                type="button"
                onClick={handleCopyToAllWorkingDays}
                className="bg-stone-100 text-stone-700 hover:bg-rose-50 hover:text-rose-700 text-xs font-semibold py-2.5 px-3 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer border border-stone-200/60"
                title="Скопировать часы и обед этого дня на все рабочие смены месяца"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">На все рабочие</span>
                <span className="sm:hidden">На все</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Генератор шаблона на весь месяц */}
      <div className="bg-gradient-to-br from-rose-50/60 via-white to-amber-50/40 p-4 rounded-2xl border border-rose-100 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-rose-500" />
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            Генератор шаблона на {monthTitle}
          </h3>
        </div>

        <p className="text-[11px] text-stone-500 leading-relaxed">
          Быстро заполните весь месяц рабочими сменами по графику с автоматическим расчетом
          интервалов и перерывов.
        </p>

        {/* Выбор паттерна смен */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-stone-700 block">
            Схема рабочих дней:
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPattern('5_2');
              }}
              className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                pattern === '5_2'
                  ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300'
              }`}
            >
              5 / 2 (Будни)
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPattern('2_2');
              }}
              className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                pattern === '2_2'
                  ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300'
              }`}
            >
              2 / 2 (Сменный)
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPattern('all');
              }}
              className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                pattern === 'all'
                  ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300'
              }`}
            >
              Каждый день
            </button>
          </div>
        </div>

        {/* Базовые часы шаблона */}
        <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-stone-200/70">
          <div>
            <label className="text-[11px] text-stone-500 block mb-1">Время начала:</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-800"
            />
          </div>
          <div>
            <label className="text-[11px] text-stone-500 block mb-1">Время окончания:</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-800"
            />
          </div>

          <div className="col-span-2 pt-1 flex items-center justify-between text-xs border-t border-stone-100">
            <span className="text-stone-600">Обед ({breakStart} — {breakEnd})</span>
            <span className="text-stone-500 text-[11px]">Стерилизация: {sterilizationBuffer} мин</span>
          </div>
        </div>

        {/* Большая главная кнопка: Применить шаблон на текущий месяц */}
        <button
          id="apply-template-month-btn"
          type="button"
          onClick={handleApplyTemplate}
          className="w-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <Wand2 className="w-4 h-4" />
          <span>Применить шаблон на текущий месяц ({monthTitle})</span>
        </button>
      </div>
    </div>
  );
};
