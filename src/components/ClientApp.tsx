import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { ServiceSelector } from './ServiceSelector';
import { SlotSelector } from './SlotSelector';
import { PhotoUpload } from './PhotoUpload';
import { BookingConfirmation } from './BookingConfirmation';
import { SuccessScreen } from './SuccessScreen';
import {
  CategorizedServices,
  BookingState,
  AvailableSlot,
  Appointment,
} from '../types';
import { api, INITIAL_SERVICES } from '../services/api';
import {
  getTelegramUser,
  getTelegramWebApp,
  triggerHaptic,
  MASTER_TG_IDS,
} from '../utils/telegram';

export const ClientApp: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [services, setServices] = useState<CategorizedServices>(INITIAL_SERVICES);
  const [createdAppointment, setCreatedAppointment] = useState<Appointment | null>(null);

  const tgUser = getTelegramUser();
  const todayStr = new Date().toISOString().split('T')[0];

  const [booking, setBooking] = useState<BookingState>({
    selectedRemovalId: 1, // По умолчанию: "Без снятия"
    selectedBaseId: 10,   // По умолчанию: "Комбинированный маникюр + гель-лак"
    selectedDesignId: 20, // По умолчанию: "Без дизайна"
    selectedRepairIds: [],
    targetDate: todayStr,
    selectedSlot: null,
    photoCurrent: null,
    photoRef: null,
    comment: '',
    clientName: tgUser.firstName || 'Алина',
    clientPhone: '+7 (999) 123-45-67',
    clientUsername: tgUser.username || '',
    tgId: tgUser.id,
  });

  // Загрузка услуг
  useEffect(() => {
    api.getServices().then((data) => {
      if (data) setServices(data);
    });
  }, []);

  // Синхронизация нативной кнопки Telegram BackButton
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg?.BackButton) return;

    if (currentStep > 1 && currentStep < 5) {
      tg.BackButton.show();
      const handleBack = () => {
        setCurrentStep((prev) => Math.max(1, prev - 1));
      };
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton?.offClick(handleBack);
      };
    } else {
      tg.BackButton.hide();
    }
  }, [currentStep]);

  // Сбор списка ID всех выбранных услуг
  const selectedServiceIds = [
    booking.selectedRemovalId,
    booking.selectedBaseId,
    booking.selectedDesignId,
    ...booking.selectedRepairIds,
  ].filter((id): id is number => id !== null);

  // Обработчики шагов выбора услуг
  const handleSelectRemoval = (id: number) => {
    setBooking((prev) => ({ ...prev, selectedRemovalId: id, selectedSlot: null }));
  };

  const handleSelectBase = (id: number) => {
    setBooking((prev) => ({ ...prev, selectedBaseId: id, selectedSlot: null }));
  };

  const handleSelectDesign = (id: number) => {
    setBooking((prev) => ({ ...prev, selectedDesignId: id, selectedSlot: null }));
  };

  const handleToggleRepair = (id: number) => {
    setBooking((prev) => {
      const exists = prev.selectedRepairIds.includes(id);
      return {
        ...prev,
        selectedRepairIds: exists
          ? prev.selectedRepairIds.filter((item) => item !== id)
          : [...prev.selectedRepairIds, id],
        selectedSlot: null,
      };
    });
  };

  // Переход на следующий шаг
  const handleProceedToStep2 = () => {
    triggerHaptic('light');
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Выбор даты и слота
  const handleDateChange = (date: string) => {
    setBooking((prev) => ({ ...prev, targetDate: date, selectedSlot: null }));
  };

  const handleSelectSlot = (slot: AvailableSlot) => {
    triggerHaptic('light');
    setBooking((prev) => ({ ...prev, selectedSlot: slot }));
  };

  const handleProceedToStep3 = () => {
    triggerHaptic('light');
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Загрузка фото ногтей и референса
  const handlePhotoCurrentChange = (url: string | null) => {
    setBooking((prev) => ({ ...prev, photoCurrent: url }));
  };

  const handlePhotoRefChange = (url: string | null) => {
    setBooking((prev) => ({ ...prev, photoRef: url }));
  };

  const handleCommentChange = (comment: string) => {
    setBooking((prev) => ({ ...prev, comment }));
  };

  const handleProceedToStep4 = () => {
    triggerHaptic('light');
    setCurrentStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Обновление контактных данных
  const handleClientNameChange = (clientName: string) => {
    setBooking((prev) => ({ ...prev, clientName }));
  };

  const handleClientPhoneChange = (clientPhone: string) => {
    setBooking((prev) => ({ ...prev, clientPhone }));
  };

  // Подтверждение и создание бронирования
  const handleConfirmBooking = async () => {
    triggerHaptic('success');
    const appointment = await api.createAppointment(booking);
    setCreatedAppointment(appointment);
    setCurrentStep(5);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Сброс и создание новой записи
  const handleResetBooking = () => {
    triggerHaptic('medium');
    setBooking({
      selectedRemovalId: 1,
      selectedBaseId: 10,
      selectedDesignId: 20,
      selectedRepairIds: [],
      targetDate: todayStr,
      selectedSlot: null,
      photoCurrent: null,
      photoRef: null,
      comment: '',
      clientName: tgUser.firstName || 'Алина',
      clientPhone: '+7 (999) 123-45-67',
      clientUsername: tgUser.username || '',
      tgId: tgUser.id,
    });
    setCreatedAppointment(null);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col font-sans selection:bg-rose-100 selection:text-rose-900">
      {/* Баннер предпросмотра для мастера */}
      {MASTER_TG_IDS.includes(tgUser.id) && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-900 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
          <span className="flex items-center gap-1.5 font-medium">
            👁️ Режим предпросмотра (глазами клиента)
          </span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              window.location.search = '?role=master';
            }}
            className="text-rose-700 hover:text-rose-900 font-semibold underline cursor-pointer"
          >
            В кабинет мастера →
          </button>
        </div>
      )}

      {/* Шапка клиента со шкалой этапов */}
      <Header
        currentStep={currentStep}
        onStepClick={(step) => {
          triggerHaptic('light');
          setCurrentStep(step);
        }}
      />

      {/* Основной контейнер формы */}
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        {currentStep === 1 && (
          <ServiceSelector
            services={services}
            selectedRemovalId={booking.selectedRemovalId}
            selectedBaseId={booking.selectedBaseId}
            selectedDesignId={booking.selectedDesignId}
            selectedRepairIds={booking.selectedRepairIds}
            onSelectRemoval={handleSelectRemoval}
            onSelectBase={handleSelectBase}
            onSelectDesign={handleSelectDesign}
            onToggleRepair={handleToggleRepair}
            onProceed={handleProceedToStep2}
            onProceedToSlots={handleProceedToStep2}
          />
        )}

        {currentStep === 2 && (
          <SlotSelector
            selectedServiceIds={selectedServiceIds}
            services={services}
            selectedDate={booking.targetDate}
            targetDate={booking.targetDate}
            selectedSlot={booking.selectedSlot}
            onSelectDate={handleDateChange}
            onDateChange={handleDateChange}
            onSelectSlot={handleSelectSlot}
            onBack={() => setCurrentStep(1)}
            onProceed={handleProceedToStep3}
            onProceedToPhotos={handleProceedToStep3}
          />
        )}

        {currentStep === 3 && (
          <PhotoUpload
            photoCurrent={booking.photoCurrent}
            photoRef={booking.photoRef}
            comment={booking.comment}
            onSetPhotoCurrent={handlePhotoCurrentChange}
            onPhotoCurrentChange={handlePhotoCurrentChange}
            onSetPhotoRef={handlePhotoRefChange}
            onPhotoRefChange={handlePhotoRefChange}
            onSetComment={handleCommentChange}
            onCommentChange={handleCommentChange}
            onBack={() => setCurrentStep(2)}
            onProceed={handleProceedToStep4}
            onProceedToConfirm={handleProceedToStep4}
          />
        )}

        {currentStep === 4 && (
          <BookingConfirmation
            booking={booking}
            services={services}
            onUpdateClientInfo={(name, phone) => {
              handleClientNameChange(name);
              handleClientPhoneChange(phone);
            }}
            onClientNameChange={handleClientNameChange}
            onClientPhoneChange={handleClientPhoneChange}
            onBack={() => setCurrentStep(3)}
            onConfirm={handleConfirmBooking}
          />
        )}

        {currentStep === 5 && createdAppointment && (
          <SuccessScreen
            appointment={createdAppointment}
            onReset={handleResetBooking}
            onNewBooking={handleResetBooking}
          />
        )}
      </main>
    </div>
  );
};
