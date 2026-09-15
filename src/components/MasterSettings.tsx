import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  MapPin,
  Camera,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Clock,
  Sparkles,
  Loader2,
  Save,
  AlertCircle
} from 'lucide-react';
import { Service, ServiceCategory, CategorizedServices, StudioConfig } from '../types';
import { api } from '../services/api';
import { triggerHaptic } from '../utils/telegram';

interface MasterSettingsProps {
  onConfigUpdated?: (config: StudioConfig) => void;
}

// Сжатие аватарки через HTML5 Canvas
const compressAvatar = (file: File, size = 400, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unsupported'));
        return;
      }

      // Обрезка по центру квадрата
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Не удалось загрузить картинку'));
    };
  });
};

export const MasterSettings: React.FC<MasterSettingsProps> = ({ onConfigUpdated }) => {
  // Состояние профиля студии
  const [config, setConfig] = useState<StudioConfig>({
    studio_name: '',
    studio_address: '',
    avatar_url: null,
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSavedToast, setConfigSavedToast] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Состояние услуг
  const [services, setServices] = useState<CategorizedServices>({
    removal: [],
    base: [],
    design: [],
    repair: [],
  });
  const [activeCategory, setActiveCategory] = useState<ServiceCategory>('removal');
  const [loadingServices, setLoadingServices] = useState(false);

  // Модалка добавления/редактирования услуги
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<{
    category: ServiceCategory;
    name: string;
    description: string;
    duration_minutes: number;
    price: number;
  }>({
    category: 'removal',
    name: '',
    description: '',
    duration_minutes: 15,
    price: 0,
  });

  // Загрузка данных при монтировании
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadingServices(true);
    try {
      const [conf, srvs] = await Promise.all([
        api.getStudioConfig(),
        api.getServices(),
      ]);
      setConfig(conf);
      setServices(srvs);
    } catch (e) {
      console.error('Ошибка загрузки данных настроек:', e);
    } finally {
      setLoadingServices(false);
    }
  };

  // Сохранение настроек профиля
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('medium');
    setIsSavingConfig(true);
    try {
      const updated = await api.updateStudioConfig(config);
      setConfig(updated);
      if (onConfigUpdated) onConfigUpdated(updated);
      triggerHaptic('success');
      setConfigSavedToast(true);
      setTimeout(() => setConfigSavedToast(false), 3000);
    } catch (err) {
      console.error('Ошибка сохранения профиля:', err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Загрузка аватарки
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      const base64 = await compressAvatar(file, 400, 0.8);
      const updatedConfig = { ...config, avatar_url: base64 };
      setConfig(updatedConfig);
      await api.updateStudioConfig(updatedConfig);
      if (onConfigUpdated) onConfigUpdated(updatedConfig);
      triggerHaptic('success');
    } catch (err) {
      console.error('Ошибка сжатия аватарки:', err);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  // Удаление аватарки
  const handleRemoveAvatar = async () => {
    triggerHaptic('light');
    const updatedConfig = { ...config, avatar_url: null };
    setConfig(updatedConfig);
    await api.updateStudioConfig(updatedConfig);
    if (onConfigUpdated) onConfigUpdated(updatedConfig);
  };

  // Открытие модалки создания
  const handleOpenCreateModal = () => {
    triggerHaptic('light');
    setEditingService(null);
    setFormData({
      category: activeCategory,
      name: '',
      description: '',
      duration_minutes: activeCategory === 'base' ? 90 : 15,
      price: activeCategory === 'base' ? 1900 : 0,
    });
    setIsModalOpen(true);
  };

  // Открытие модалки редактирования
  const handleOpenEditModal = (service: Service) => {
    triggerHaptic('light');
    setEditingService(service);
    setFormData({
      category: service.category,
      name: service.name,
      description: service.description || '',
      duration_minutes: service.duration_minutes,
      price: service.price,
    });
    setIsModalOpen(true);
  };

  // Переключение активности услуги (скрыть/показать клиентам)
  const handleToggleActive = async (service: Service) => {
    triggerHaptic('light');
    const newActive = !service.is_active;
    
    // Оптимистичное обновление
    setServices((prev) => ({
      ...prev,
      [service.category]: prev[service.category].map((s) =>
        s.id === service.id ? { ...s, is_active: newActive } : s
      ),
    }));

    await api.updateService(service.id, { is_active: newActive });
  };

  // Удаление услуги
  const handleDeleteService = async (serviceId: number, category: ServiceCategory) => {
    if (!confirm('Вы действительно хотите удалить или скрыть эту услугу?')) return;
    triggerHaptic('medium');

    setServices((prev) => ({
      ...prev,
      [category]: prev[category].filter((s) => s.id !== serviceId),
    }));

    await api.deleteService(serviceId);
  };

  // Сохранение услуги (создание или обновление)
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    triggerHaptic('medium');

    if (editingService) {
      // Обновление существующей
      const updated = await api.updateService(editingService.id, formData);
      setServices((prev) => {
        // Если изменилась категория, перемещаем
        if (editingService.category !== formData.category) {
          return {
            ...prev,
            [editingService.category]: prev[editingService.category].filter(
              (s) => s.id !== editingService.id
            ),
            [formData.category]: [...prev[formData.category], updated],
          };
        }
        return {
          ...prev,
          [formData.category]: prev[formData.category].map((s) =>
            s.id === editingService.id ? updated : s
          ),
        };
      });
    } else {
      // Создание новой
      const created = await api.createService({
        ...formData,
        sort_order: services[formData.category].length + 1,
        is_active: true,
      });

      setServices((prev) => ({
        ...prev,
        [formData.category]: [...prev[formData.category], created],
      }));
    }

    triggerHaptic('success');
    setIsModalOpen(false);
  };

  // Форматирование длительности для бейджа
  const formatDurationBadge = (mins: number) => {
    if (mins === 0) return '0 мин';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
  };

  const categories: { key: ServiceCategory; title: string; count: number }[] = [
    { key: 'removal', title: 'Снятие', count: services.removal.length },
    { key: 'base', title: 'Покрытие', count: services.base.length },
    { key: 'design', title: 'Дизайн', count: services.design.length },
    { key: 'repair', title: 'Ремонт', count: services.repair.length },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. ПРОФИЛЬ СТУДИИ И АДРЕС */}
      <section className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Профиль студии</h3>
              <p className="text-[11px] text-stone-500">
                Название, адрес и аватарка отображаются клиентам
              </p>
            </div>
          </div>
        </div>

        {/* Загрузка аватарки */}
        <div className="flex items-center gap-4 pt-1">
          <div className="relative group">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-rose-200 bg-stone-100 flex items-center justify-center shadow-xs">
              {config.avatar_url ? (
                <img
                  src={config.avatar_url}
                  alt="Аватарка"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-rose-600">
                  {config.studio_name ? config.studio_name.charAt(0).toUpperCase() : '💅'}
                </span>
              )}
            </div>

            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}

            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-rose-600 transition-colors cursor-pointer"
              title="Изменить фото"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="flex-1 space-y-1">
            <p className="text-xs font-semibold text-stone-800">
              Логотип или фото мастера
            </p>
            <p className="text-[11px] text-stone-400 leading-tight">
              Сжимается автоматически до компактного размера
            </p>
            {config.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-[11px] text-rose-600 hover:text-rose-700 font-medium underline pt-0.5 cursor-pointer"
              >
                Удалить фото
              </button>
            )}
          </div>
        </div>

        {/* Форма названия и адреса */}
        <form onSubmit={handleSaveConfig} className="space-y-3 pt-2">
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">
              Название студии или имя мастера
            </label>
            <div className="relative">
              <input
                type="text"
                value={config.studio_name}
                onChange={(e) => setConfig({ ...config, studio_name: e.target.value })}
                placeholder="например: Студия Екатерины"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400 transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">
              Адрес студии / кабинета
            </label>
            <div className="relative">
              <input
                type="text"
                value={config.studio_address}
                onChange={(e) => setConfig({ ...config, studio_address: e.target.value })}
                placeholder="например: г. Москва, ул. Арбат, д. 10, каб. 304"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400 transition-colors"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {configSavedToast ? (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Настройки сохранены
              </span>
            ) : <span />}

            <button
              type="submit"
              disabled={isSavingConfig}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingConfig ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Сохранить профиль</span>
            </button>
          </div>
        </form>
      </section>

      {/* 2. УПРАВЛЕНИЕ УСЛУГАМИ (CRUD) */}
      <section className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Каталог услуг</h3>
              <p className="text-[11px] text-stone-500">
                Добавляйте новые услуги, меняйте цены и длительность
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить</span>
          </button>
        </div>

        {/* Табы категорий */}
        <div className="flex p-1 bg-stone-100/80 rounded-xl gap-1">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveCategory(cat.key);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeCategory === cat.key
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <span>{cat.title}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeCategory === cat.key ? 'bg-rose-100 text-rose-800' : 'bg-stone-200/70 text-stone-600'
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Список услуг в выбранной категории */}
        {loadingServices ? (
          <div className="py-8 text-center text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-rose-500" />
            <p className="text-xs mt-2">Загрузка услуг...</p>
          </div>
        ) : services[activeCategory].length === 0 ? (
          <div className="py-8 text-center border border-dashed border-stone-200 rounded-xl bg-stone-50/50">
            <AlertCircle className="w-6 h-6 text-stone-300 mx-auto" />
            <p className="text-xs font-medium text-stone-600 mt-1.5">В этой категории пока нет услуг</p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="text-xs text-rose-600 font-semibold underline mt-1 cursor-pointer"
            >
              + Добавить первую услугу
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {services[activeCategory].map((srv) => (
              <div
                key={srv.id}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                  srv.is_active
                    ? 'bg-white border-stone-200 hover:border-rose-300 shadow-2xs'
                    : 'bg-stone-50/70 border-stone-200/60 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-stone-900 truncate">
                      {srv.name}
                    </h4>
                    {!srv.is_active && (
                      <span className="text-[9px] bg-stone-200 text-stone-600 px-1.5 py-0.2 rounded font-medium">
                        Скрыта
                      </span>
                    )}
                  </div>
                  {srv.description && (
                    <p className="text-[10px] text-stone-400 truncate mt-0.5">
                      {srv.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-bold text-rose-700">
                      {srv.price === 0 ? '0 ₽' : `${srv.price.toLocaleString('ru-RU')} ₽`}
                    </span>
                    <span className="text-[10px] text-stone-400">•</span>
                    <span className="text-[10px] text-stone-500 flex items-center gap-0.5">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {formatDurationBadge(srv.duration_minutes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(srv)}
                    className={`p-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      srv.is_active
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                    }`}
                    title={srv.is_active ? 'Скрыть от клиентов' : 'Сделать доступной'}
                  >
                    {srv.is_active ? 'Вкл' : 'Выкл'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(srv)}
                    className="p-1.5 bg-stone-100 text-stone-700 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title="Редактировать"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteService(srv.id, srv.category)}
                    className="p-1.5 bg-stone-100 text-stone-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ УСЛУГИ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900">
                {editingService ? 'Редактировать услугу' : 'Новая услуга'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Категория
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as ServiceCategory })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400"
                >
                  <option value="removal">Снятие старого материала</option>
                  <option value="base">Основное покрытие</option>
                  <option value="design">Дизайн</option>
                  <option value="repair">Ремонт / Укрепление</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Название услуги *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="например: Френч любым цветом"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Краткое описание (опционально)
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="например: Аккуратная линия улыбки на всех 10 пальцах"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Длительность (мин)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400 font-semibold"
                    required
                  />
                  <span className="text-[10px] text-stone-400 block mt-0.5">
                    {formatDurationBadge(formData.duration_minutes)}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Цена (₽)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-rose-400 font-semibold"
                    required
                  />
                  <span className="text-[10px] text-stone-400 block mt-0.5">
                    {formData.price === 0 ? 'Бесплатно (0 ₽)' : `${formData.price} ₽`}
                  </span>
                </div>
              </div>

              {/* Быстрые пресеты времени */}
              <div>
                <span className="text-[10px] text-stone-400 block mb-1">Быстрый выбор длительности:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: '0 мин', val: 0 },
                    { label: '15 мин', val: 15 },
                    { label: '20 мин', val: 20 },
                    { label: '25 мин', val: 25 },
                    { label: '45 мин', val: 45 },
                    { label: '1 ч (60м)', val: 60 },
                    { label: '1ч 15м', val: 75 },
                    { label: '1ч 45м', val: 105 },
                    { label: '2ч 20м', val: 140 },
                    { label: '2ч 40м', val: 160 },
                    { label: '3 часа', val: 180 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setFormData({ ...formData, duration_minutes: p.val })}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer transition-colors ${
                        formData.duration_minutes === p.val
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 rounded-xl cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {editingService ? 'Сохранить изменения' : 'Добавить услугу'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
