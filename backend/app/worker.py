import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.reminders import check_reminders


async def main():
    print("⏳ Starting Reminder Worker...")

    scheduler = AsyncIOScheduler()
    # Запускаем проверку каждую минуту
    scheduler.add_job(check_reminders, 'interval', minutes=1)
    scheduler.start()

    print("✅ Worker is running! Reminders are active.")

    # Бесконечный цикл, чтобы процесс не завершился
    try:
        while True:
            await asyncio.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    asyncio.run(main())