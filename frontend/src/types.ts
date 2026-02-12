export interface Service {
    id: number;
    name: string;
    price: number;
    duration_min: number;
    description?: string;
    category: 'dog' | 'cat';
    master_telegram_id?: number;
    is_active?: boolean;
}

export interface MasterProfile {
    telegram_id?: number;
    salon_name: string;
    address: string;
    phone: string;
    description: string;
    avatar_url: string;
    photos: string[];
    timezone: string;
    is_premium: boolean;
    is_approved?: boolean;
}

export interface WorkingHour {
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
}

export interface Appointment {
    id: number;
    master_telegram_id: number;
    service_id: number;
    services?: { name: string };
    starts_at: string; // ISO string
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    client_name: string;
    client_phone: string;
    client_username?: string;
    pet_name: string;
    pet_breed?: string;
    pet_photos?: string[];
    comment?: string;
}