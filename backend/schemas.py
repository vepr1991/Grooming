import re
from datetime import date, datetime, time
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OrganizationInput(Input):
    name: str = Field(min_length=2, max_length=100)
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=30)
    timezone: str = "Asia/Almaty"
    currency: Literal["KZT", "RUB", "USD", "EUR"] = "KZT"
    slot_step: int = Field(default=30, ge=5, le=120)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, v):
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Неизвестный часовой пояс")
        return v


class ClientInput(Input):
    name: str = Field(min_length=2, max_length=100)
    phone: str
    notes: str = Field(default="", max_length=2000)

    @field_validator("phone")
    @classmethod
    def phone_number(cls, v):
        digits = re.sub(r"[^0-9]", "", v)
        if len(digits) == 11 and digits[0] == "8":
            digits = "7" + digits[1:]
        if not 10 <= len(digits) <= 15:
            raise ValueError("Укажите телефон с кодом страны")
        return "+" + digits


class PetInput(Input):
    name: str = Field(min_length=1, max_length=100)
    breed: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=2000)


class ServiceInput(Input):
    title: str = Field(min_length=2, max_length=100)
    price_minor: int = Field(ge=0, le=100000000)
    duration_minutes: int = Field(ge=5, le=480)
    member_ids: list[UUID] = Field(min_length=1, max_length=100)
    active: bool = True


class InviteInput(Input):
    name: str = Field(min_length=2, max_length=100)
    role: Literal["admin", "groomer"] = "groomer"


class AcceptInvite(Input):
    token: str = Field(min_length=20, max_length=100)


class MemberInput(Input):
    name: str = Field(min_length=2, max_length=100)
    role: Literal["owner", "admin", "groomer"]
    active: bool = True
    bookable: bool = True


class WorkDay(Input):
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def valid_hours(self):
        if self.start_time >= self.end_time:
            raise ValueError("Конец должен быть позже начала")
        if self.start_time.tzinfo or self.end_time.tzinfo:
            raise ValueError("Укажите местное время")
        return self


class ScheduleInput(Input):
    days: list[WorkDay] = Field(max_length=7)

    @model_validator(mode="after")
    def unique_days(self):
        if len({d.weekday for d in self.days}) != len(self.days):
            raise ValueError("Дни повторяются")
        return self


class ExceptionInput(Input):
    day: date
    start_time: time | None = None
    end_time: time | None = None

    @model_validator(mode="after")
    def valid_hours(self):
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Заполните оба времени")
        if self.start_time is not None:
            if self.start_time >= self.end_time:
                raise ValueError("Некорректное время")
            if self.start_time.tzinfo or self.end_time.tzinfo:
                raise ValueError("Укажите местное время")
        return self


class BookingInput(Input):
    member_id: UUID
    service_ids: list[UUID] = Field(min_length=1, max_length=10)
    start_time: datetime
    client: ClientInput
    pet: PetInput
    request_key: UUID

    @field_validator("start_time")
    @classmethod
    def aware(cls, v):
        if v.tzinfo is None:
            raise ValueError("Время должно содержать часовой пояс")
        return v

    @field_validator("service_ids")
    @classmethod
    def unique(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("Услуги повторяются")
        return v


class ManualBooking(BookingInput):
    client_id: UUID | None = None
    pet_id: UUID | None = None


class MoveInput(Input):
    member_id: UUID
    start_time: datetime
    version: int = Field(ge=1)
    _aware = field_validator("start_time")(BookingInput.aware.__func__)


class StatusInput(Input):
    status: Literal["pending", "confirmed", "completed", "canceled", "no_show"]
    version: int = Field(ge=1)


class BlockInput(Input):
    member_id: UUID
    start_time: datetime
    duration_minutes: int = Field(ge=5, le=1440)
    reason: str = Field(default="Перерыв", max_length=200)
    _aware = field_validator("start_time")(BookingInput.aware.__func__)


class PaymentInput(Input):
    amount_minor: int = Field(gt=0, le=100000000)
    kind: Literal["payment", "refund"] = "payment"
    method: Literal["cash", "transfer", "card"] = "transfer"
    note: str = Field(default="", max_length=500)
    request_key: UUID


class SubscriptionPayment(Input):
    amount_minor: int = Field(gt=0, le=100000000)
    reference: str = Field(min_length=3, max_length=300)
    request_key: UUID
