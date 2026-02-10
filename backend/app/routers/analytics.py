from fastapi import APIRouter, Depends
from ..db import supabase
from ..auth import validate_telegram_data
from datetime import datetime, timedelta
from collections import Counter

router = APIRouter(prefix="/me/analytics", tags=["Analytics"])


@router.get("/dashboard")
async def get_dashboard_stats(user=Depends(validate_telegram_data)):
    # 1. Проверяем Pro
    master = supabase.table("masters").select("is_premium").eq("telegram_id", user['id']).single().execute()
    if not master.data.get('is_premium'):
        return {"is_premium": False}

    # 2. Берем данные за последние 30 дней
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)

    res = supabase.table("appointments") \
        .select("*, services(name, price)") \
        .eq("master_telegram_id", user['id']) \
        .gte("starts_at", start_date.strftime("%Y-%m-%d")) \
        .execute()

    apps = res.data

    # 3. Считаем метрики (KPIs)
    completed_apps = [a for a in apps if a['status'] == 'completed']
    revenue = sum(a['services']['price'] for a in completed_apps if a['services'])
    avg_check = round(revenue / len(completed_apps)) if completed_apps else 0

    # 4. Популярные услуги
    srv_names = [a['services']['name'] for a in completed_apps if a['services']]
    top_services = [{"name": k, "count": v} for k, v in Counter(srv_names).most_common(3)]

    # 5. Статусы (для Pie Chart)
    statuses = {
        "completed": len(completed_apps),
        "cancelled": len([a for a in apps if a['status'] == 'cancelled']),
        "pending": len([a for a in apps if a['status'] == 'pending']),
    }

    # 6. Динамика по дням (для Bar Chart) - последние 7 дней
    daily_stats = []
    for i in range(6, -1, -1):
        d = end_date - timedelta(days=i)
        d_str = d.strftime("%Y-%m-%d")
        # Ищем записи за этот день
        count = len([a for a in apps if a['starts_at'].startswith(d_str)])
        daily_stats.append({
            "day": d.strftime("%d %b"),  # 21 Окт
            "value": count,
            "is_today": i == 0
        })

    return {
        "is_premium": True,
        "kpi": {
            "revenue": revenue,
            "avg_check": avg_check,
            "total_completed": len(completed_apps)
        },
        "top_services": top_services,
        "status_distribution": statuses,
        "daily_dynamics": daily_stats
    }