import React, { useRef } from 'react';
import { Camera, Upload, ArrowLeft, Image as ImageIcon, X, Sparkles, HelpCircle, Check } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface PhotoUploadProps {
  photoCurrent: string | null;
  photoRef: string | null;
  comment: string;
  onSetPhotoCurrent?: (dataUrl: string | null) => void;
  onPhotoCurrentChange?: (dataUrl: string | null) => void;
  onSetPhotoRef?: (dataUrl: string | null) => void;
  onPhotoRefChange?: (dataUrl: string | null) => void;
  onSetComment?: (comment: string) => void;
  onCommentChange?: (comment: string) => void;
  onBack: () => void;
  onProceedToConfirm?: () => void;
  onProceed?: () => void;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({
  photoCurrent,
  photoRef,
  comment,
  onSetPhotoCurrent,
  onPhotoCurrentChange,
  onSetPhotoRef,
  onPhotoRefChange,
  onSetComment,
  onCommentChange,
  onBack,
  onProceedToConfirm,
  onProceed,
}) => {
  const setPhotoCurrent = (val: string | null) => {
    if (onSetPhotoCurrent) onSetPhotoCurrent(val);
    if (onPhotoCurrentChange) onPhotoCurrentChange(val);
  };
  const setPhotoRef = (val: string | null) => {
    if (onSetPhotoRef) onSetPhotoRef(val);
    if (onPhotoRefChange) onPhotoRefChange(val);
  };
  const setComment = (val: string) => {
    if (onSetComment) onSetComment(val);
    if (onCommentChange) onCommentChange(val);
  };
  const handleProceed = () => {
    if (onProceedToConfirm) onProceedToConfirm();
    else if (onProceed) onProceed();
  };
  const currentFileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      triggerHaptic('success');
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Демо-шаблоны фотографий для быстрого тестирования в браузере
  const sampleCurrentPhotos = [
    {
      label: 'Старое покрытие',
      url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=500&auto=format&fit=crop&q=60',
    },
    {
      label: 'Натуральные ногти',
      url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=500&auto=format&fit=crop&q=60',
    },
  ];

  const sampleRefDesigns = [
    {
      label: 'Идеальный френч',
      url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=500&auto=format&fit=crop&q=60',
    },
    {
      label: 'Нюд + блестки',
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=60',
    },
  ];

  return (
    <div className="pb-32 max-w-md mx-auto px-4 pt-3 space-y-6">
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
        <span>Назад к выбору даты и времени</span>
      </button>

      {/* Поясняющая плашка */}
      <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200/60 shadow-xs flex items-start gap-3">
        <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
          <Camera className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-stone-900">
            Фото-контроль перед визитом
          </h2>
          <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
            Фото текущих ногтей помогает мастеру оценить состояние кутикулы и сложность материала, чтобы не выйти за рамки забронированного времени.
          </p>
        </div>
      </div>

      {/* 1. ИСХОДНИК (ТЕКУЩИЕ НОГТИ) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center">
              1
            </span>
            <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
              Исходник (текущее состояние ногтей)
            </h3>
          </div>
          <span className="text-[10px] text-rose-600 font-medium">Желательно</span>
        </div>

        {photoCurrent ? (
          <div className="relative rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 aspect-video flex items-center justify-center shadow-xs">
            <img
              src={photoCurrent}
              alt="Исходник ногтей"
              className="w-full h-full object-cover"
            />
            <button
              id="btn-remove-current-photo"
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPhotoCurrent(null);
              }}
              className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-xs text-white rounded-md text-[10px] font-medium flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              Исходник загружен
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              ref={currentFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, setPhotoCurrent)}
            />
            <div
              id="dropzone-current-photo"
              onClick={() => currentFileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-rose-400 p-5 rounded-2xl bg-white text-center cursor-pointer transition-colors space-y-2 group"
            >
              <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-rose-50 text-stone-500 group-hover:text-rose-500 flex items-center justify-center mx-auto transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-800">
                  Нажмите для загрузки фото ногтей
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Сфотографируйте пальцы при дневном свете
                </p>
              </div>
            </div>

            {/* Быстрые примеры для демо */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] text-stone-400 shrink-0">Или выберите тест:</span>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {sampleCurrentPhotos.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPhotoCurrent(s.url);
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-stone-100 text-stone-600 hover:bg-rose-100 hover:text-rose-700 transition-colors border border-stone-200/60 whitespace-nowrap cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. РЕФЕРЕНС (ЖЕЛАЕМЫЙ ДИЗАЙН) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center">
              2
            </span>
            <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
              Референс (желаемый дизайн)
            </h3>
          </div>
          <span className="text-[10px] text-stone-400">Опционально</span>
        </div>

        {photoRef ? (
          <div className="relative rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 aspect-video flex items-center justify-center shadow-xs">
            <img
              src={photoRef}
              alt="Референс дизайна"
              className="w-full h-full object-cover"
            />
            <button
              id="btn-remove-ref-photo"
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPhotoRef(null);
              }}
              className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-xs text-white rounded-md text-[10px] font-medium flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              Референс прикреплен
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              ref={refFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, setPhotoRef)}
            />
            <div
              id="dropzone-ref-photo"
              onClick={() => refFileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-rose-400 p-5 rounded-2xl bg-white text-center cursor-pointer transition-colors space-y-2 group"
            >
              <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-rose-50 text-stone-500 group-hover:text-rose-500 flex items-center justify-center mx-auto transition-colors">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-800">
                  Прикрепите скриншот дизайна
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Из Pinterest, Instagram или Telegram
                </p>
              </div>
            </div>

            {/* Быстрые примеры для демо */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] text-stone-400 shrink-0">Или выберите арт:</span>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {sampleRefDesigns.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPhotoRef(s.url);
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-stone-100 text-stone-600 hover:bg-rose-100 hover:text-rose-700 transition-colors border border-stone-200/60 whitespace-nowrap cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. КОММЕНТАРИЙ И ПОЖЕЛАНИЯ К ПРОЦЕДУРЕ */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
          Пожелания к форме и процедуре
        </h3>
        <textarea
          id="input-client-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: хочу мягкий квадрат, чувствительная кутикула, нравится молочный оттенок..."
          className="w-full p-3 rounded-xl border border-stone-200 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-400 bg-white"
        />
      </section>

      {/* ПЛАВАЮЩИЙ НИЖНИЙ БАР */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/80 p-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] text-stone-500 block">
              {photoCurrent ? '✓ Исходник прикреплен' : 'Без фото исходника'}
            </span>
            <span className="text-xs font-medium text-stone-700">
              Шаг 3 из 4 завершен
            </span>
          </div>

          <button
            id="btn-proceed-to-confirm"
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              handleProceed();
            }}
            className="px-5 py-3 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 shadow-sm bg-stone-900 text-white hover:bg-stone-800 active:scale-98 cursor-pointer"
          >
            <span>Перейти к итогу</span>
            <span className="text-stone-300">→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
