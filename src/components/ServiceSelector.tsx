import React from 'react';
import { Clock, ShieldCheck, Check, Sparkles, AlertCircle } from 'lucide-react';
import { CategorizedServices, Service } from '../types';
import { triggerHaptic } from '../utils/telegram';

interface ServiceSelectorProps {
  services: CategorizedServices;
  selectedRemovalId: number | null;
  selectedBaseId: number | null;
  selectedDesignId: number | null;
  selectedRepairIds: number[];
  onSelectRemoval: (id: number) => void;
  onSelectBase: (id: number) => void;
  onSelectDesign: (id: number) => void;
  onToggleRepair: (id: number) => void;
  onProceedToSlots?: () => void;
  onProceed?: () => void;
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  services,
  selectedRemovalId,
  selectedBaseId,
  selectedDesignId,
  selectedRepairIds,
  onSelectRemoval,
  onSelectBase,
  onSelectDesign,
  onToggleRepair,
  onProceedToSlots,
  onProceed,
}) => {
  // Находим выбранные объекты услуг для подсчета
  const allServices: Service[] = [
    ...services.removal,
    ...services.base,
    ...services.design,
    ...services.repair,
  ];

  const currentSelectedIds = [
    selectedRemovalId,
    selectedBaseId,
    selectedDesignId,
    ...selectedRepairIds,
  ].filter((id): id is number => id !== null);

  const selectedServices = allServices.filter((s) => currentSelectedIds.includes(s.id));
  const procedureMinutes = selectedServices.reduce((acc, s) => acc + s.duration_minutes, 0);
  const sterilizationBufferMinutes = 15;
  const totalDurationMinutes = procedureMinutes + sterilizationBufferMinutes;
  const totalPrice = selectedServices.reduce((acc, s) => acc + s.price, 0);

  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    if (hours > 0 && m > 0) return `${hours} ч ${m} мин`;
    if (hours > 0) return `${hours} ч`;
    return `${m} мин`;
  };

  const isFormValid = selectedRemovalId !== null && selectedBaseId !== null && selectedDesignId !== null;

  return (
    <div className="pb-32 max-w-md mx-auto px-4 pt-3 space-y-6">
      {/* Баннер Конструктора */}
      <div className="bg-gradient-to-br from-rose-50 to-orange-50/40 p-3.5 rounded-2xl border border-rose-200/50 shadow-xs">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-900">
              Конструктор процедуры
            </h2>
            <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
              Выберите все этапы — от снятия до дизайна. Мы рассчитаем точное время и подберем только те окна, в которые мастер успеет без спешки!
            </p>
          </div>
        </div>
      </div>

      {/* 1. ЭТАП: СНЯТИЕ */}
      <section className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <h3 className="text-sm font-semibold text-stone-900 leading-tight">
              Снятие старого материала
            </h3>
          </div>
          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 shrink-0">Обязательно</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {services.removal.map((service) => {
            const isSelected = selectedRemovalId === service.id;
            return (
              <div
                key={service.id}
                id={`service-removal-${service.id}`}
                onClick={() => {
                  triggerHaptic('light');
                  onSelectRemoval(service.id);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500/30'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                }`}
              >
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-900 leading-snug">
                      {service.name}
                    </span>
                  </div>
                  {service.description && (
                    <p className="text-[11px] text-stone-500 leading-snug">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-stone-500">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {service.duration_minutes > 0 ? `${service.duration_minutes} мин` : '0 мин'}
                    </span>
                    <span className="text-xs font-bold text-stone-900">
                      {service.price > 0 ? `${service.price.toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isSelected
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-stone-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. ЭТАП: БАЗА / МАНИКЮР */}
      <section className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <h3 className="text-sm font-semibold text-stone-900 leading-tight">
              Основное покрытие и маникюр
            </h3>
          </div>
          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 shrink-0">Обязательно</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {services.base.map((service) => {
            const isSelected = selectedBaseId === service.id;
            return (
              <div
                key={service.id}
                id={`service-base-${service.id}`}
                onClick={() => {
                  triggerHaptic('light');
                  onSelectBase(service.id);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500/30'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                }`}
              >
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-semibold text-stone-900 leading-snug">
                    {service.name}
                  </span>
                  {service.description && (
                    <p className="text-[11px] text-stone-500 leading-snug">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-stone-500">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {formatDuration(service.duration_minutes)}
                    </span>
                    <span className="text-xs font-bold text-stone-900">
                      {service.price.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isSelected
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-stone-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. ЭТАП: ДИЗАЙН */}
      <section className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <h3 className="text-sm font-semibold text-stone-900 leading-tight">
              Дизайн ногтей
            </h3>
          </div>
          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 shrink-0">Обязательно</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {services.design.map((service) => {
            const isSelected = selectedDesignId === service.id;
            return (
              <div
                key={service.id}
                id={`service-design-${service.id}`}
                onClick={() => {
                  triggerHaptic('light');
                  onSelectDesign(service.id);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500/30'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                }`}
              >
                <div className="space-y-1 pr-2">
                  <span className="text-xs font-semibold text-stone-900">
                    {service.name}
                  </span>
                  {service.description && (
                    <p className="text-[11px] text-stone-500 leading-normal">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="flex items-center gap-1 text-[11px] text-stone-500">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {service.duration_minutes > 0 ? `${service.duration_minutes} мин` : '0 мин'}
                    </span>
                    <span className="text-xs font-bold text-stone-900">
                      {service.price > 0 ? `${service.price.toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isSelected
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-stone-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. ЭТАП: РЕМОНТ И УКРЕПЛЕНИЕ (МУЛЬТИВЫБОР / ОПЦИОНАЛЬНО) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold flex items-center justify-center">
              4
            </span>
            <h3 className="text-sm font-semibold text-stone-900">
              Ремонт и донаращивание
            </h3>
          </div>
          <span className="text-[11px] text-stone-400">По необходимости</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {services.repair.map((service) => {
            const isSelected = selectedRepairIds.includes(service.id);
            return (
              <div
                key={service.id}
                id={`service-repair-${service.id}`}
                onClick={() => {
                  triggerHaptic('light');
                  onToggleRepair(service.id);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/40 shadow-xs ring-1 ring-amber-500/30'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                }`}
              >
                <div className="space-y-1 pr-2">
                  <span className="text-xs font-semibold text-stone-900">
                    {service.name}
                  </span>
                  {service.description && (
                    <p className="text-[11px] text-stone-500 leading-normal">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="flex items-center gap-1 text-[11px] text-stone-500">
                      <Clock className="w-3 h-3 text-stone-400" />
                      +{service.duration_minutes} мин
                    </span>
                    <span className="text-xs font-bold text-stone-900">
                      +{service.price.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isSelected
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-stone-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ПЛАВАЮЩИЙ НИЖНИЙ БАР (FIXED BOTTOM BAR) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/80 p-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-stone-900">
                {totalPrice > 0 ? `${totalPrice.toLocaleString('ru-RU')} ₽` : '0 ₽'}
              </span>
              <span className="text-xs font-medium text-stone-500">
                • {formatDuration(procedureMinutes)}
              </span>
            </div>
            {!isFormValid && (
              <div className="text-[10px] text-rose-500 font-medium">
                Выберите обязательные этапы 1, 2 и 3
              </div>
            )}
          </div>

          <button
            id="btn-proceed-to-slots"
            type="button"
            disabled={!isFormValid}
            onClick={() => {
              if (!isFormValid) return;
              triggerHaptic('medium');
              if (onProceedToSlots) {
                onProceedToSlots();
              } else if (onProceed) {
                onProceed();
              }
            }}
            className={`px-5 py-3 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 shadow-sm ${
              isFormValid
                ? 'bg-rose-500 hover:bg-rose-600 text-white active:scale-98 cursor-pointer'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed opacity-80'
            }`}
          >
            <span>Выбрать время</span>
            <span className={isFormValid ? 'text-white/80' : 'text-stone-400'}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
