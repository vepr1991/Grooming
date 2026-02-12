import uuid
from app.db import supabase
from app.schemas.appointment import AppointmentCreate


class AppointmentService:
    @staticmethod
    async def create(data: AppointmentCreate, client_id: int, client_username: str = None):
        """
        Создает запись в базе данных.
        Загрузка фото теперь происходит на стороне клиента (React),
        сервер получает только ссылки.
        """
        appt_dict = data.model_dump()

        insert_data = {
            "master_telegram_id": appt_dict['master_telegram_id'],
            "service_id": appt_dict['service_id'],
            "client_telegram_id": client_id,
            "client_username": client_username,
            "client_name": appt_dict['client_name'],
            "client_phone": appt_dict['client_phone'],
            "pet_name": appt_dict['pet_name'],
            "pet_breed": appt_dict.get('pet_breed'),
            "comment": appt_dict.get('comment'),

            # Сохраняем массив ссылок на фото, который прислал фронтенд
            "pet_photos": appt_dict.get('pet_photos', []),

            "starts_at": appt_dict['starts_at'].isoformat(),
            "status": "pending",
            "idempotency_key": appt_dict.get('idempotency_key') or str(uuid.uuid4())
        }

        # Выполняем вставку в таблицу appointments.
        # Если время уже занято, сработает UNIQUE INDEX, который мы создали в БД,
        # и Supabase вернет ошибку.
        try:
            res = supabase.table("appointments").insert(insert_data).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            # Тут можно добавить логику обработки дубликатов (idempotency)
            print(f"Database error: {e}")
            raise e