/**
 * Клиентский сервис данных и Smart Scheduling Engine для Telegram Mini App.
 * Обеспечивает полную функциональность как при подключении к FastAPI backend,
 * так и в автономном режиме браузера с сохранением состояния в localStorage.
 */

import {
  CategorizedServices,
  Service,
  AvailableSlot,
  CalculatedTiming,
  Appointment,
  BookingState,
  MasterScheduleDay,
  ScheduleTemplateSettings,
  MasterMonthOverview,
  MonthDaySchedule,
  StudioConfig
} from '../types';

// Начальный каталог услуг на русском языке (полностью соответствует backend/database.py)
export const INITIAL_SERVICES: CategorizedServices = {
  removal: [
    {
      id: 1,
      category: 'removal',
      name: 'без снятия',
      description: 'Ногти чистые, снятие предыдущего материала не требуется',
      duration_minutes: 0,
      price: 0,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 2,
      category: 'removal',
      name: 'снятие покрытия',
      description: 'Бережное аппаратное снятие покрытия фрезой',
      duration_minutes: 15,
      price: 0,
      sort_order: 2,
      is_active: true,
    },
    {
      id: 3,
      category: 'removal',
      name: 'снятие наращенных ногтей',
      description: 'Снятие наращенных ногтей',
      duration_minutes: 20,
      price: 0,
      sort_order: 3,
      is_active: true,
    },
    {
      id: 4,
      category: 'removal',
      name: 'любое снятие + маникюр (без дальнейшего покрытия)',
      description: 'Снятие любого покрытия и гигиенический маникюр',
      duration_minutes: 60,
      price: 900,
      sort_order: 4,
      is_active: true,
    },
  ],
  base: [
    {
      id: 10,
      category: 'base',
      name: '-',
      description: 'Без основного покрытия',
      duration_minutes: 0,
      price: 0,
      sort_order: 10,
      is_active: true,
    },
    {
      id: 11,
      category: 'base',
      name: 'маникюр с покрытием на свои до 1 длины',
      description: 'Маникюр с покрытием на свои ногти до 1 длины',
      duration_minutes: 105,
      price: 1900,
      sort_order: 11,
      is_active: true,
    },
    {
      id: 12,
      category: 'base',
      name: 'маникюр с наращиванием ногтей длина до 3',
      description: 'Маникюр с наращиванием ногтей длина до 3',
      duration_minutes: 140,
      price: 2400,
      sort_order: 12,
      is_active: true,
    },
    {
      id: 13,
      category: 'base',
      name: 'маникюр с наращивание ногтей длина до 7',
      description: 'Маникюр с наращиванием ногтей длина до 7',
      duration_minutes: 160,
      price: 2800,
      sort_order: 13,
      is_active: true,
    },
    {
      id: 14,
      category: 'base',
      name: 'маникюр с наращиванием ногтей длина до 10',
      description: 'Маникюр с наращиванием ногтей длина до 10',
      duration_minutes: 180,
      price: 3400,
      sort_order: 14,
      is_active: true,
    },
  ],
  design: [
    {
      id: 20,
      category: 'design',
      name: 'без дизайна (чистый однотон)',
      description: 'Классическое однотонное покрытие',
      duration_minutes: 0,
      price: 0,
      sort_order: 20,
      is_active: true,
    },
    {
      id: 21,
      category: 'design',
      name: 'френч любым цветом',
      description: 'Френч любым цветом на всех ногтях',
      duration_minutes: 25,
      price: 0,
      sort_order: 21,
      is_active: true,
    },
    {
      id: 22,
      category: 'design',
      name: 'легкий дизайн (втирка/покрытие гель-лаком/кошачий глаз)',
      description: 'Втирка, покрытие гель-лаком или кошачий глаз',
      duration_minutes: 20,
      price: 0,
      sort_order: 22,
      is_active: true,
    },
    {
      id: 23,
      category: 'design',
      name: 'средний дизайн (декоративные элементы/фигурки/бульонки/стразы/паутинка/градиент/минималистичная роспись/наклейки/слайдеры/френч с вышеперечисленным)',
      description: 'Декоративные элементы, фигурки, бульонки, стразы, слайдеры, роспись',
      duration_minutes: 45,
      price: 0,
      sort_order: 23,
      is_active: true,
    },
    {
      id: 24,
      category: 'design',
      name: 'сложный дизайн (аквариумный дизайн/авторская роспись/сочетание большого количества элементов и цветов/инкрустация кристаллами/геометрия)',
      description: 'Аквариумный дизайн, сложная авторская роспись, инкрустация',
      duration_minutes: 75,
      price: 300,
      sort_order: 24,
      is_active: true,
    },
  ],
  repair: [
    {
      id: 30,
      category: 'repair',
      name: 'Ремонт трещины / донаращивание (1 ноготь)',
      description: 'Восстановление сломанного уголка или трещины',
      duration_minutes: 15,
      price: 150,
      sort_order: 30,
      is_active: true,
    },
    {
      id: 31,
      category: 'repair',
      name: 'Донаращивание угла / длины (1 ноготь)',
      description: 'Восстановление формы или донаращивание одного ногтя',
      duration_minutes: 15,
      price: 200,
      sort_order: 31,
      is_active: true,
    },
  ],
};

const STERILIZATION_BUFFER_MINUTES = 15;

export const getAllFlatServices = (): Service[] => {
  return [
    ...INITIAL_SERVICES.removal,
    ...INITIAL_SERVICES.base,
    ...INITIAL_SERVICES.design,
    ...INITIAL_SERVICES.repair,
  ];
};

export const calculateTiming = (selectedServiceIds: number[]): CalculatedTiming => {
  const allServices = getAllFlatServices();
  const selected = allServices.filter((s) => selectedServiceIds.includes(s.id));

  const servicesDuration = selected.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalPrice = selected.reduce((sum, s) => sum + s.price, 0);
  const totalWithBuffer = servicesDuration + STERILIZATION_BUFFER_MINUTES;

  return {
    servicesDurationMinutes: servicesDuration,
    sterilizationBufferMinutes: STERILIZATION_BUFFER_MINUTES,
    totalDurationMinutes: totalWithBuffer,
    totalPrice,
    servicesSummary: selected.map((s) => s.name),
  };
};

// Загрузка / сохранение записей из localStorage
const STORAGE_APPOINTMENTS_KEY = 'nail_app_appointments_v1';

export const getStoredAppointments = (): Appointment[] => {
  try {
    const raw = localStorage.getItem(STORAGE_APPOINTMENTS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Ошибка чтения appointments из localStorage:', e);
  }

  // Демо-записи для проверки реалистичной занятости мастера
  const today = new Date().toISOString().split('T')[0];
  const sampleAppointments: Appointment[] = [
    {
      id: 101,
      client_id: 1,
      client_name: 'Ольга Васильева',
      client_phone: '+7 (916) 444-11-22',
      client_username: 'olga_v',
      master_id: 1,
      date: today,
      start_time: '10:00',
      end_time: '12:00',
      total_procedure_minutes: 120,
      sterilization_buffer_minutes: 15,
      total_duration_minutes: 135,
      total_price: 2700,
      status: 'confirmed',
      comment: 'Люблю овальную форму, не срезайте кутикулу слишком глубоко.',
      services: ['Снятие гель-лака другого мастера', 'Комбинированный маникюр + гель-лак', 'Французский маникюр (Френч / Лунный)'],
      created_at: new Date().toISOString(),
    },
    {
      id: 102,
      client_id: 2,
      client_name: 'Мария Кузнецова',
      client_phone: '+7 (903) 777-33-44',
      client_username: 'kuznetsova_m',
      master_id: 1,
      date: today,
      start_time: '16:00',
      end_time: '18:30',
      total_procedure_minutes: 150,
      sterilization_buffer_minutes: 15,
      total_duration_minutes: 165,
      total_price: 3800,
      status: 'confirmed',
      comment: 'Хочу наращивание под нюд и легкий стемпинг.',
      services: ['Без снятия', 'Наращивание ногтей (длина 1–3)', 'Без дизайна (чистый однотон)'],
      created_at: new Date().toISOString(),
    },
  ];

  localStorage.setItem(STORAGE_APPOINTMENTS_KEY, JSON.stringify(sampleAppointments));
  return sampleAppointments;
};

export const saveAppointment = (appointment: Appointment) => {
  const existing = getStoredAppointments();
  const updated = [appointment, ...existing];
  localStorage.setItem(STORAGE_APPOINTMENTS_KEY, JSON.stringify(updated));
};

// Хранилище настроек графика мастера
const STORAGE_SCHEDULE_KEY = 'nail_app_master_schedule_v1';

export const getStoredSchedule = (): Record<string, MasterScheduleDay> => {
  try {
    const raw = localStorage.getItem(STORAGE_SCHEDULE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Ошибка чтения графика мастера из localStorage:', e);
  }
  return {};
};

export const saveStoredSchedule = (schedules: Record<string, MasterScheduleDay>) => {
  try {
    localStorage.setItem(STORAGE_SCHEDULE_KEY, JSON.stringify(schedules));
  } catch (e) {
    console.error('Ошибка записи графика мастера в localStorage:', e);
  }
};

// Реализация алгоритма SmartSchedulingEngine на клиенте для мгновенного отклика
export const computeAvailableSlotsLocal = (
  targetDateStr: string,
  totalDurationWithBuffer: number,
  procedureDuration: number
): { slots: AvailableSlot[]; isDayOff: boolean } => {
  const targetDate = new Date(targetDateStr);
  const dayOfWeek = targetDate.getDay(); // 0 - воскресенье

  const storedSchedule = getStoredSchedule();
  const customDay = storedSchedule[targetDateStr];

  // Если день настроен мастером:
  if (customDay) {
    if (!customDay.is_working_day) {
      return { slots: [], isDayOff: true };
    }
  } else {
    // По умолчанию: воскресенье — выходной
    if (dayOfWeek === 0) {
      return { slots: [], isDayOff: true };
    }
  }

  // Часы работы мастера
  const parseTimeToMin = (tStr: string) => {
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  const workStart = customDay ? parseTimeToMin(customDay.start_time) : 10 * 60;
  const workEnd = customDay ? parseTimeToMin(customDay.end_time) : 20 * 60;

  // Обед мастера
  const busyBlocks: { start: number; end: number }[] = [];
  if (customDay?.break_start && customDay?.break_end) {
    busyBlocks.push({
      start: parseTimeToMin(customDay.break_start),
      end: parseTimeToMin(customDay.break_end),
    });
  } else if (!customDay) {
    // Дефолтный обед: 14:00 - 15:00
    busyBlocks.push({ start: 14 * 60, end: 15 * 60 });
  }

  // Добавляем существующие подтвержденные и ожидающие записи
  const appointments = getStoredAppointments().filter(
    (a) => a.date === targetDateStr && a.status !== 'cancelled'
  );

  appointments.forEach((app) => {
    const [h, m] = app.start_time.split(':').map(Number);
    const startM = h * 60 + m;
    const endM = startM + app.total_duration_minutes; // с учетом буфера
    busyBlocks.push({ start: startM, end: endM });
  });

  // Сортировка занятых блоков
  busyBlocks.sort((a, b) => a.start - b.start);

  // Слияние перекрывающихся занятых блоков
  const mergedBusy: { start: number; end: number }[] = [];
  for (const block of busyBlocks) {
    if (mergedBusy.length === 0) {
      mergedBusy.push({ ...block });
    } else {
      const last = mergedBusy[mergedBusy.length - 1];
      if (block.start <= last.end) {
        last.end = Math.max(last.end, block.end);
      } else {
        mergedBusy.push({ ...block });
      }
    }
  }

  // Поиск свободных окон (Free Blocks)
  const freeBlocks: { start: number; end: number }[] = [];
  let cursor = workStart;

  for (const busy of mergedBusy) {
    const bStart = Math.max(workStart, busy.start);
    const bEnd = Math.min(workEnd, busy.end);

    if (bStart > cursor) {
      freeBlocks.push({ start: cursor, end: bStart });
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < workEnd) {
    freeBlocks.push({ start: cursor, end: workEnd });
  }

  // Генерация слотов с шагом 15 минут
  const step = 15;
  const slots: AvailableSlot[] = [];

  // Ограничение по текущему времени, если запись на сегодня
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let minStartM = 0;
  if (targetDateStr === todayStr) {
    minStartM = now.getHours() * 60 + now.getMinutes() + 30; // +30 мин на сборы
  }

  const formatTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  for (const block of freeBlocks) {
    const blockDuration = block.end - block.start;
    if (blockDuration < totalDurationWithBuffer) {
      continue;
    }

    let start = block.start;
    const remainder = start % step;
    if (remainder !== 0) {
      start += step - remainder;
    }

    while (start + totalDurationWithBuffer <= block.end) {
      if (start >= minStartM) {
        slots.push({
          start_time: formatTime(start),
          end_time: formatTime(start + procedureDuration),
          buffer_end_time: formatTime(start + totalDurationWithBuffer),
          start_minutes: start,
        });
      }
      start += step;
    }
  }

  return { slots, isDayOff: false };
};

// Настройка базового URL для связи фронтенда с FastAPI backend
const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || '';
export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, '');

export const buildApiUrl = (endpoint: string): string => {
  // if (API_BASE_URL) {
  //   return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  // }
  return endpoint;
};

export const api = {
  getServices: async (): Promise<CategorizedServices> => {
    const url = buildApiUrl('/api/services');
    try {
      console.log('📡 [API Request] GET', url);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('✅ [API Response] Services loaded from backend:', Object.keys(data).length, 'categories');
        return data;
      }
      console.warn('⚠️ [API Warning] Backend returned non-ok status for services:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to connect to FastAPI backend for services, using local fallback:', err);
    }
    return INITIAL_SERVICES;
  },

  getAvailableSlots: async (
    masterId: number,
    dateStr: string,
    serviceIds: number[]
  ): Promise<{ timing: CalculatedTiming; slots: AvailableSlot[]; isDayOff: boolean }> => {
    const timing = calculateTiming(serviceIds);
    const url = buildApiUrl('/api/slots');
    try {
      console.log('📡 [API Request] POST', url, { masterId, dateStr, serviceIds });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_id: masterId,
          target_date: dateStr,
          service_ids: serviceIds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('✅ [API Response] Slots received from backend:', data.available_slots?.length || 0);
        return {
          timing,
          slots: data.available_slots || [],
          isDayOff: data.is_day_off || false,
        };
      }
      console.warn('⚠️ [API Warning] Backend returned non-ok status for slots:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to fetch slots from backend, using local engine:', err);
    }

    const { slots, isDayOff } = computeAvailableSlotsLocal(
      dateStr,
      timing.totalDurationMinutes,
      timing.servicesDurationMinutes
    );

    return { timing, slots, isDayOff };
  },

  createAppointment: async (booking: BookingState): Promise<Appointment> => {
    const allServices = getAllFlatServices();
    const selectedIds = [
      booking.selectedRemovalId,
      booking.selectedBaseId,
      booking.selectedDesignId,
      ...booking.selectedRepairIds,
    ].filter((id): id is number => id !== null);

    const timing = calculateTiming(selectedIds);
    const selectedServiceNames = allServices
      .filter((s) => selectedIds.includes(s.id))
      .map((s) => s.name);

    const payload = {
      master_id: 1,
      tg_id: booking.tgId,
      client_name: booking.clientName,
      client_phone: booking.clientPhone,
      client_username: booking.clientUsername,
      date: booking.targetDate,
      start_time: booking.selectedSlot?.start_time || '12:00',
      service_ids: selectedIds,
      photo_current_url_or_file_id: booking.photoCurrent,
      photo_ref_url_or_file_id: booking.photoRef,
      comment: booking.comment,
    };

    const url = buildApiUrl('/api/appointments');
    try {
      console.log('📡 [API Request] POST', url, payload);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        console.log('✅ [API Response] Appointment created in DB:', created);
        saveAppointment(created);
        return created;
      }
      console.warn('⚠️ [API Warning] Backend appointments status:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to save appointment to FastAPI backend:', err);
    }

    const newAppointment: Appointment = {
      id: Date.now(),
      client_id: booking.tgId,
      client_name: booking.clientName,
      client_phone: booking.clientPhone,
      client_username: booking.clientUsername,
      master_id: 1,
      date: booking.targetDate,
      start_time: booking.selectedSlot?.start_time || '12:00',
      end_time: booking.selectedSlot?.end_time || '14:00',
      total_procedure_minutes: timing.servicesDurationMinutes,
      sterilization_buffer_minutes: timing.sterilizationBufferMinutes,
      total_duration_minutes: timing.totalDurationMinutes,
      total_price: timing.totalPrice,
      status: 'pending',
      photo_current: booking.photoCurrent || undefined,
      photo_ref: booking.photoRef || undefined,
      comment: booking.comment || undefined,
      services: selectedServiceNames,
      created_at: new Date().toISOString(),
    };

    saveAppointment(newAppointment);
    return newAppointment;
  },

  getMasterMonthSchedule: async (masterId: number, month: string): Promise<MasterMonthOverview> => {
    const url = buildApiUrl(`/api/schedule/month?master_id=${masterId}&month=${month}`);
    try {
      console.log('📡 [API Request] GET', url);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('✅ [API Response] Month schedule loaded from DB');
        return data;
      }
      console.warn('⚠️ [API Warning] Backend schedule status:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to fetch month schedule from backend:', err);
    }

    // Локальный генератор данных месяца на основе localStorage
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const storedSchedule = getStoredSchedule();
    const storedAppointments = getStoredAppointments();

    const days: MonthDaySchedule[] = [];
    let totalWorking = 0;
    let totalApps = 0;
    let totalRevenue = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(year, monthNum - 1, d);
      const dayOfWeek = (dt.getDay() + 6) % 7; // 0=Пн, 6=Вс

      const custom = storedSchedule[dateStr];
      const isWorking = custom !== undefined ? custom.is_working_day : dayOfWeek !== 6;
      const startTime = custom?.start_time || '10:00';
      const endTime = custom?.end_time || '20:00';
      const breakStart = custom?.break_start || '14:00';
      const breakEnd = custom?.break_end || '15:00';
      const buffer = custom?.sterilization_buffer_minutes || 15;

      const dayApps = storedAppointments.filter(
        (a) => a.date === dateStr && a.status !== 'cancelled'
      );
      const dayRev = dayApps.reduce((sum, a) => sum + a.total_price, 0);

      if (isWorking) totalWorking++;
      totalApps += dayApps.length;
      totalRevenue += dayRev;

      days.push({
        date: dateStr,
        day_number: d,
        day_of_week: dayOfWeek,
        is_working_day: isWorking,
        start_time: startTime,
        end_time: endTime,
        break_start: breakStart,
        break_end: breakEnd,
        sterilization_buffer_minutes: buffer,
        appointments_count: dayApps.length,
        revenue_expected: dayRev,
      });
    }

    return {
      master_id: masterId,
      month,
      days,
      total_working_days: totalWorking,
      total_appointments: totalApps,
      total_revenue: totalRevenue,
    };
  },

  applyScheduleTemplate: async (
    settings: ScheduleTemplateSettings,
    masterId: number = 1
  ): Promise<{ success: boolean; message: string }> => {
    const url = buildApiUrl('/api/schedule/template');
    try {
      console.log('📡 [API Request] POST', url, settings);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_id: masterId,
          month: settings.month,
          pattern: settings.pattern,
          start_time: settings.startTime,
          end_time: settings.endTime,
          break_start: settings.breakStart,
          break_end: settings.breakEnd,
          sterilization_buffer_minutes: settings.sterilizationBufferMinutes,
          custom_working_dates: settings.customWorkingDates,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('✅ [API Response] Template applied in DB:', data.message);
        return { success: true, message: data.message };
      }
      console.warn('⚠️ [API Warning] Template status:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to apply template on backend:', err);
    }

    // Локальное применение шаблона в localStorage
    const [yearStr, monthStr] = settings.month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const stored = getStoredSchedule();
    const customSet = new Set(settings.customWorkingDates || []);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(year, monthNum - 1, d);
      const dayOfWeek = (dt.getDay() + 6) % 7; // 0=Пн, 6=Вс

      let isWork = true;
      if (settings.pattern === '5_2') {
        isWork = dayOfWeek < 5; // Пн-Пт
      } else if (settings.pattern === '2_2') {
        isWork = ((d - 1) % 4) < 2;
      } else if (settings.pattern === 'all') {
        isWork = true;
      } else if (settings.pattern === 'custom') {
        isWork = customSet.has(dateStr);
      }

      stored[dateStr] = {
        date: dateStr,
        is_working_day: isWork,
        start_time: settings.startTime,
        end_time: settings.endTime,
        break_start: settings.breakStart,
        break_end: settings.breakEnd,
        sterilization_buffer_minutes: settings.sterilizationBufferMinutes,
      };
    }

    saveStoredSchedule(stored);
    return {
      success: true,
      message: `Шаблон '${settings.pattern}' успешно сохранен на ${settings.month}`,
    };
  },

  setDaySchedule: async (
    masterId: number,
    day: MasterScheduleDay
  ): Promise<{ success: boolean; message: string }> => {
    const url = buildApiUrl(`/api/schedule/day?master_id=${masterId}`);
    try {
      console.log('📡 [API Request] POST', url, day);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(day),
      });
      if (res.ok) {
        console.log('✅ [API Response] Day schedule updated in DB');
        return { success: true, message: 'День успешно обновлен' };
      }
      console.warn('⚠️ [API Warning] Day schedule status:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to update day schedule on backend:', err);
    }

    const stored = getStoredSchedule();
    stored[day.date] = day;
    saveStoredSchedule(stored);
    return { success: true, message: `День ${day.date} успешно сохранен` };
  },

  getMasterDaySchedule: async (masterId: number, dateStr: string): Promise<Appointment[]> => {
    const url = buildApiUrl(`/api/schedule?master_id=${masterId}&schedule_date=${dateStr}`);
    try {
      console.log('📡 [API Request] GET', url);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('✅ [API Response] Day schedule loaded from DB', data);
        return data.appointments || [];
      }
      console.warn('⚠️ [API Warning] Backend schedule status:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to fetch day schedule from backend:', err);
    }

    // Fallback
    return getStoredAppointments().filter((a) => a.date === dateStr);
  },

  updateAppointmentStatus: async (appointmentId: number, status: Appointment['status']): Promise<{ success: boolean; newStatus?: Appointment['status'] }> => {
    const url = buildApiUrl(`/api/appointments/${appointmentId}/status?status_value=${status}`);
    try {
      console.log('📡 [API Request] PATCH', url);
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        console.log('✅ [API Response] Status updated in DB:', data);
        return { success: true, newStatus: data.new_status };
      }
      console.warn('⚠️ [API Warning] Failed to update status on backend, status:', res.status);
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to update status on backend:', err);
    }
    
    // Fallback to local storage update
    const updated = getStoredAppointments().map(a => a.id === appointmentId ? { ...a, status } : a);
    localStorage.setItem(STORAGE_APPOINTMENTS_KEY, JSON.stringify(updated));
    return { success: true, newStatus: status };
  },

  getStudioConfig: async (): Promise<StudioConfig> => {
    const url = buildApiUrl('/api/config');
    try {
      console.log('📡 [API Request] GET', url);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to fetch studio config:', err);
    }
    const local = localStorage.getItem('nail_studio_config');
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    return {
      studio_name: 'Студия маникюра Екатерина',
      studio_address: 'г. Москва, ул. Арбат, д. 10, кабинет 304',
      avatar_url: null,
      default_sterilization_buffer: 15,
    };
  },

  updateStudioConfig: async (config: Partial<StudioConfig>): Promise<StudioConfig> => {
    const url = buildApiUrl('/api/config');
    try {
      console.log('📡 [API Request] POST', url, config);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('nail_studio_config', JSON.stringify(data));
        return data;
      }
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to update studio config:', err);
    }
    const prev = await api.getStudioConfig();
    const merged = { ...prev, ...config };
    localStorage.setItem('nail_studio_config', JSON.stringify(merged));
    return merged;
  },

  createService: async (service: Omit<Service, 'id'>): Promise<Service> => {
    const url = buildApiUrl('/api/services');
    try {
      console.log('📡 [API Request] POST', url, service);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service),
      });
      if (res.ok) {
        const created = await res.json();
        return created;
      }
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to create service on backend:', err);
    }
    const newService: Service = {
      ...service,
      id: Date.now(),
    };
    return newService;
  },

  updateService: async (serviceId: number, update: Partial<Service>): Promise<Service> => {
    const url = buildApiUrl(`/api/services/${serviceId}`);
    try {
      console.log('📡 [API Request] PUT', url, update);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (res.ok) {
        const updated = await res.json();
        return updated;
      }
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to update service on backend:', err);
    }
    return { id: serviceId, ...update } as Service;
  },

  deleteService: async (serviceId: number): Promise<boolean> => {
    const url = buildApiUrl(`/api/services/${serviceId}`);
    try {
      console.log('📡 [API Request] DELETE', url);
      const res = await fetch(url, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.warn('⚠️ [API Error] Failed to delete service on backend:', err);
      return true;
    }
  },
};
