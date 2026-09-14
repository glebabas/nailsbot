/**
 * TypeScript интерфейсы для Telegram Mini App мастера маникюра
 */

export type ServiceCategory = 'removal' | 'base' | 'design' | 'repair';

export interface Service {
  id: number;
  category: ServiceCategory;
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  sort_order: number;
  is_active: boolean;
}

export interface CategorizedServices {
  removal: Service[];
  base: Service[];
  design: Service[];
  repair: Service[];
}

export interface AvailableSlot {
  start_time: string;       // e.g. "14:30"
  end_time: string;         // e.g. "16:30" (без буфера)
  buffer_end_time: string;  // e.g. "16:45" (с буфером стерилизации)
  start_minutes: number;
}

export interface CalculatedTiming {
  servicesDurationMinutes: number;
  sterilizationBufferMinutes: number;
  totalDurationMinutes: number;
  totalPrice: number;
  servicesSummary: string[];
}

export interface BookingState {
  selectedRemovalId: number | null;
  selectedBaseId: number | null;
  selectedDesignId: number | null;
  selectedRepairIds: number[];
  
  targetDate: string; // YYYY-MM-DD
  selectedSlot: AvailableSlot | null;
  
  photoCurrent: string | null;  // Исходник ногтей (base64 data URL)
  photoRef: string | null;      // Референс дизайна (base64 data URL)
  comment: string;              // Пожелания клиента
  
  clientName: string;
  clientPhone: string;
  clientUsername: string;
  tgId: number;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface Appointment {
  id: number;
  client_id: number;
  client_name: string;
  client_phone?: string;
  client_username?: string;
  master_id: number;
  date: string;
  start_time: string;
  end_time: string;
  total_procedure_minutes: number;
  sterilization_buffer_minutes: number;
  total_duration_minutes: number;
  total_price: number;
  status: AppointmentStatus;
  photo_current?: string;
  photo_ref?: string;
  comment?: string;
  services: string[];
  created_at: string;
}

export interface MasterScheduleDay {
  date: string;
  is_working_day: boolean;
  start_time: string;
  end_time: string;
  break_start?: string;
  break_end?: string;
  sterilization_buffer_minutes: number;
}

export type SchedulePattern = '5_2' | '2_2' | 'all' | 'custom';

export interface ScheduleTemplateSettings {
  month: string; // "YYYY-MM"
  pattern: SchedulePattern;
  startTime: string; // "10:00"
  endTime: string; // "20:00"
  breakStart: string; // "14:00"
  breakEnd: string; // "15:00"
  sterilizationBufferMinutes: number; // 15
  customWorkingDates?: string[];
}

export interface MonthDaySchedule {
  date: string;
  day_number: number;
  day_of_week: number;
  is_working_day: boolean;
  start_time: string;
  end_time: string;
  break_start?: string;
  break_end?: string;
  sterilization_buffer_minutes: number;
  appointments_count: number;
  revenue_expected: number;
}

export interface MasterMonthOverview {
  master_id: number;
  month: string;
  days: MonthDaySchedule[];
  total_working_days: number;
  total_appointments: number;
  total_revenue: number;
}

