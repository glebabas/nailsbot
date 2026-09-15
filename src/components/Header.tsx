import React, { useState, useEffect } from 'react';
import { Sparkles, MapPin, Star, UserCheck, ShieldCheck } from 'lucide-react';
import { getTelegramUser } from '../utils/telegram';
import { api } from '../services/api';
import { StudioConfig } from '../types';

interface HeaderProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onStepClick,
}) => {
  const tgUser = getTelegramUser();
  const [studioConfig, setStudioConfig] = useState<StudioConfig | null>(null);

  useEffect(() => {
    api.getStudioConfig().then(setStudioConfig);
  }, []);

  const steps = [
    { num: 1, label: 'Услуги' },
    { num: 2, label: 'Время' },
    { num: 3, label: 'Фото' },
    { num: 4, label: 'Итог' },
  ];

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-rose-100/70 sticky top-0 z-40">
      {/* Верхняя статусная плашка */}
      <div className="max-w-md mx-auto px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center text-rose-600 shadow-sm border border-rose-200 shrink-0">
            {studioConfig?.avatar_url ? (
              <img src={studioConfig.avatar_url} alt="Аватар" className="w-full h-full object-cover" />
            ) : (
              <Sparkles className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-stone-900 leading-tight truncate">
              {studioConfig?.studio_name || 'Студия маникюра'}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-stone-500 truncate">
              <span className="flex items-center gap-0.5 text-amber-600 font-medium shrink-0">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                5.0
              </span>
              <span>•</span>
              <span className="flex items-center gap-0.5 truncate">
                <MapPin className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                <span className="truncate">{studioConfig?.studio_address || 'ул. Арбат, 10'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Индикатор авторизации Telegram */}
        <div className="flex items-center gap-1.5 bg-rose-50/80 border border-rose-100/80 px-2.5 py-1 rounded-full text-[11px] text-rose-800 font-medium">
          <UserCheck className="w-3 h-3 text-rose-500" />
          <span className="truncate max-w-[90px]">{tgUser.firstName || 'Гость'}</span>
        </div>
      </div>

      {/* Индикатор шагов клиента */}
      <div className="max-w-md mx-auto px-4 pb-2.5 pt-1">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-stone-100 z-0" />
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 h-0.5 bg-rose-400 z-0 transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 90}%` }}
          />

          {steps.map((step) => {
            const isPassed = step.num < currentStep;
            const isCurrent = step.num === currentStep;

            return (
              <button
                key={step.num}
                id={`step-indicator-${step.num}`}
                type="button"
                onClick={() => {
                  if (step.num < currentStep) onStepClick(step.num);
                }}
                disabled={step.num > currentStep}
                className="relative z-10 flex flex-col items-center group cursor-pointer disabled:cursor-default"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                    isCurrent
                      ? 'bg-stone-900 text-white shadow-xs ring-4 ring-rose-100'
                      : isPassed
                      ? 'bg-rose-500 text-white'
                      : 'bg-white border border-stone-200 text-stone-400'
                  }`}
                >
                  {isPassed ? '✓' : step.num}
                </div>
                <span
                  className={`text-[10px] mt-1 font-medium transition-colors ${
                    isCurrent ? 'text-stone-900 font-semibold' : 'text-stone-400'
                  }`}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
