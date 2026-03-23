import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import Optional

from config import supabase, logger
from schemas import BookingRequest, BlockRequest, StatusUpdate
from logic import verify_telegram_data, validate_working_hours, check_overlap, send_telegram_notification_task, \
    send_client_notification

router = APIRouter()


# --- BOOKING ---
@router.post("/api/book")
async def create_booking(data: BookingRequest, background_tasks: BackgroundTasks):
    total_duration = sum(s.duration_minutes for s in data.services)
    start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
    end_dt = start_dt + timedelta(minutes=total_duration)

    validate_working_hours(data.salonId, start_dt, end_dt)
    if check_overlap(data.salonId, start_dt, end_dt): raise HTTPException(409, "Slot taken")

    payload = {
        "salon_id": data.salonId,
        "service_id": data.services[0].id if data.services else None,
        "client_name": data.client.name,
        "client_phone": data.client.phone,
        "client_tg_user": json.dumps(data.client.telegram_user),
        "pet_name": data.pet.name,
        "pet_breed": data.pet.petBreed,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "status": "pending",
        "selected_services": [s.dict() for s in data.services]
    }
    res = supabase.table("appointments").insert(payload).execute()
    background_tasks.add_task(send_telegram_notification_task, data.salonId, data, start_dt)
    return {"success": True, "id": res.data[0]['id']}


@router.post("/api/block")
async def block_slot(data: BlockRequest, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", data.salonId).eq("telegram_chat_id",
                                                                                tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")

    start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
    end_dt = start_dt + timedelta(minutes=data.duration_minutes)

    if check_overlap(data.salonId, start_dt, end_dt): raise HTTPException(409, "Slot taken")

    payload = {
        "salon_id": data.salonId,
        "client_name": data.reason,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "status": "blocked",
    }
    res = supabase.table("appointments").insert(payload).execute()
    return {"success": True, "id": res.data[0]['id']}


@router.patch("/api/appointments/{appointment_id}/status")
async def update_status(appointment_id: str, payload: StatusUpdate, background_tasks: BackgroundTasks):
    res = supabase.table("appointments").update({"status": payload.status}).eq("id", appointment_id).execute()
    if payload.status in ['confirmed', 'canceled']:
        background_tasks.add_task(send_client_notification, appointment_id, payload.status)
    return {"success": True, "data": res.data[0]}


# --- CLIENTS ---
@router.get("/api/clients/{salon_id}")
async def get_salon_clients(salon_id: str, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", tg_user_id).execute()
        if not check.data: raise HTTPException(403)
    try:
        res = supabase.table("appointments").select("*").eq("salon_id", salon_id).order("start_time",
                                                                                        desc=True).execute()
        apps = res.data or []
        clients_dict = {}
        for app in apps:
            phone = app.get('client_phone')
            if not phone: continue
            if phone not in clients_dict:
                clients_dict[phone] = {
                    "name": app['client_name'],
                    "phone": phone,
                    "pet_name": app['pet_name'],
                    "pet_breed": app['pet_breed'],
                    "total_visits": 0,
                    "last_visit": app['start_time'],
                    "tg_user": app.get('client_tg_user')
                }
            if app['status'] == 'completed': clients_dict[phone]["total_visits"] += 1
            if app['start_time'] > clients_dict[phone]["last_visit"]: clients_dict[phone]["last_visit"] = app[
                'start_time']
        return sorted(clients_dict.values(), key=lambda x: x['last_visit'], reverse=True)
    except Exception as e:
        raise HTTPException(500, str(e))


# --- ANALYTICS ---
@router.get("/api/analytics/{salon_id}")
async def get_analytics(salon_id: str, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", tg_user_id).execute()
        if not check.data: raise HTTPException(403)
    try:
        today = datetime.now()
        start_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("appointments").select("*, services(id, title, price)").eq("salon_id", salon_id).gte(
            "start_time", start_month).execute()
        apps = res.data or []

        total_rev, today_rev, comp, canc = 0, 0, 0, 0
        daily_map, services_usage = {}, {}
        today_str = today.strftime('%Y-%m-%d')

        for app in apps:
            if app['status'] == 'completed':
                comp += 1
                app_price = 0
                selected = app.get('selected_services')
                if selected and isinstance(selected, list) and len(selected) > 0:
                    for s in selected:
                        p = s.get('price', 0)
                        app_price += p
                        sid = s.get('id', 'unknown')
                        services_usage[sid] = services_usage.get(sid, {"title": s.get('title', 'Unknown'), "count": 0})
                        services_usage[sid]["count"] += 1
                elif app.get('services'):
                    s = app['services']
                    app_price = s['price']
                    services_usage[s['id']] = services_usage.get(s['id'], {"title": s['title'], "count": 0})
                    services_usage[s['id']]["count"] += 1

                total_rev += app_price
                d_str = app['start_time'][:10]
                daily_map[d_str] = daily_map.get(d_str, 0) + app_price
                if d_str == today_str: today_rev += app_price
            elif app['status'] == 'canceled':
                canc += 1

        top_services = sorted(services_usage.values(), key=lambda x: x['count'], reverse=True)[:3]
        daily_stats = [{"date": datetime.strptime(k, "%Y-%m-%d").strftime("%d.%m"), "value": v} for k, v in
                       sorted(daily_map.items())]
        return {"total_revenue": total_rev, "total_appointments": len(apps), "completed_count": comp,
                "canceled_count": canc, "today_revenue": today_rev, "daily_stats": daily_stats,
                "top_services": top_services}
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        raise HTTPException(500, str(e))