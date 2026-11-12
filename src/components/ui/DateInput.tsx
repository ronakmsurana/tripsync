"use client";

import React, { useState, useEffect, useRef } from "react";
import { fmtDateDDMMYYYY, parseDDMMYYYY } from "@/lib/client/format";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEK_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export interface DateInputProps {
  value: string; // ISO string "YYYY-MM-DD"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (e: any) => void;
  min?: string; // ISO string "YYYY-MM-DD"
  max?: string; // ISO string "YYYY-MM-DD"
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  id?: string;
  className?: string;
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  placeholder = "DD/MM/YYYY",
  name,
  id,
  className = "input-sharp",
}: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayText, setDisplayText] = useState(() => fmtDateDDMMYYYY(value));
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse view year & month from value or today
  const initDate = value && value.length >= 10 ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : new Date();
  const [viewYear, setViewYear] = useState(() => (!isNaN(initDate.getTime()) ? initDate.getUTCFullYear() : new Date().getUTCFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (!isNaN(initDate.getTime()) ? initDate.getUTCMonth() : new Date().getUTCMonth()));

  // Sync display text when value prop changes externally
  useEffect(() => {
    setDisplayText(fmtDateDDMMYYYY(value));
    if (value && value.length >= 10) {
      const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getUTCFullYear());
        setViewMonth(d.getUTCMonth());
      }
    }
  }, [value]);

  // Close calendar popover on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;

    // Filter to digits, slashes, dashes, dots
    input = input.replace(/[^\d\/\-\.]/g, "");

    // Auto-insert slash for pure digits typing
    const digitsOnly = input.replace(/[^\d]/g, "");
    if (!input.includes("/") && !input.includes("-") && !input.includes(".")) {
      if (digitsOnly.length > 4) {
        input = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4, 8)}`;
      } else if (digitsOnly.length > 2) {
        input = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}`;
      }
    }

    setDisplayText(input);

    const parsedIso = parseDDMMYYYY(input);
    if (parsedIso) {
      // Validate range if specified
      if ((!min || parsedIso >= min) && (!max || parsedIso <= max)) {
        onChange?.({ target: { value: parsedIso, name } });
        const d = new Date(`${parsedIso}T00:00:00Z`);
        setViewYear(d.getUTCFullYear());
        setViewMonth(d.getUTCMonth());
      }
    } else if (input === "" && !required) {
      onChange?.({ target: { value: "", name } });
    }
  };

  const handleInputBlur = () => {
    // If invalid text was typed, restore the last valid value on blur
    if (displayText.trim() === "") {
      if (required && value) {
        setDisplayText(fmtDateDDMMYYYY(value));
      }
      return;
    }
    const parsedIso = parseDDMMYYYY(displayText);
    if (!parsedIso) {
      setDisplayText(fmtDateDDMMYYYY(value));
    } else {
      setDisplayText(fmtDateDDMMYYYY(parsedIso));
    }
  };

  const handleSelectDate = (isoDate: string) => {
    setDisplayText(fmtDateDDMMYYYY(isoDate));
    onChange?.({ target: { value: isoDate, name } });
    setIsOpen(false);
  };

  const prevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Calendar day calculation
  const startDay = (new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay() + 6) % 7; // 0 = Monday, 6 = Sunday
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const prevMonthDays = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          id={id}
          name={name}
          value={displayText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={10}
          className={`${className} !pl-2.5 !pr-7 !py-2 text-xs sm:text-[13px] font-mono tabular-nums`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-label="Open date picker calendar"
          title="Choose date (DD/MM/YYYY)"
          className="absolute right-1 text-slate-400 hover:text-slate-800 transition-colors p-1"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="square"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Calendar date picker"
          className="absolute left-0 mt-1 z-50 w-64 bg-white border border-slate-300 shadow-xl p-3 text-slate-900 select-none animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1 text-slate-600 hover:text-slate-950 font-bold hover:bg-slate-100 rounded-none text-xs"
            >
              ‹
            </button>
            <div className="text-xs font-bold font-mono tracking-tight text-slate-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1 text-slate-600 hover:text-slate-950 font-bold hover:bg-slate-100 rounded-none text-xs"
            >
              ›
            </button>
          </div>

          {/* Weekday Names */}
          <div className="grid grid-cols-7 gap-1 mt-2 text-center text-[10px] font-bold text-slate-400 font-mono">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Month Days */}
          <div className="grid grid-cols-7 gap-1 mt-1 text-center text-xs font-mono">
            {/* Prev month days padding */}
            {Array.from({ length: startDay }).map((_, i) => (
              <div
                key={`prev-${i}`}
                className="py-1 text-[11px] text-slate-300 cursor-not-allowed select-none"
              >
                {prevMonthDays - startDay + 1 + i}
              </div>
            ))}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = value === iso;
              const isToday = todayIso === iso;
              const isDisabled = Boolean((min && iso < min) || (max && iso > max));

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDate(iso)}
                  className={`py-1 text-xs rounded-none transition-colors ${
                    isSelected
                      ? "bg-slate-950 text-white font-bold"
                      : isDisabled
                      ? "text-slate-300 cursor-not-allowed"
                      : isToday
                      ? "border border-slate-950 font-bold hover:bg-slate-100 text-slate-950"
                      : "text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick Bar */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                if ((!min || today >= min) && (!max || today <= max)) {
                  handleSelectDate(today);
                } else {
                  const d = new Date();
                  setViewYear(d.getUTCFullYear());
                  setViewMonth(d.getUTCMonth());
                }
              }}
              className="text-slate-700 hover:text-slate-950 font-semibold"
            >
              Today
            </button>
            <span className="text-[10px] text-slate-400 font-mono">DD/MM/YYYY</span>
          </div>
        </div>
      )}
    </div>
  );
}

const QUICK_TIMES = [
  "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
  "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM",
];

function parse24to12(time24: string): { hour12: number; minute: string; ampm: "AM" | "PM" } {
  const [hStr, mStr] = (time24 || "09:00").split(":");
  let h = parseInt(hStr || "9", 10);
  const m = (mStr || "00").slice(0, 2).padStart(2, "0");
  if (isNaN(h)) h = 9;
  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { hour12: h12, minute: m, ampm };
}

function to24Hour(hour12: number, minute: string, ampm: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (ampm === "PM") h += 12;
  const hStr = String(h).padStart(2, "0");
  const mStr = (minute || "00").padStart(2, "0");
  return `${hStr}:${mStr}`;
}

export interface TimeInputProps {
  value: string; // 24-hr "HH:mm" (e.g. "09:00", "15:30")
  onChange?: (val24: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

export function TimeInput({
  value,
  onChange,
  disabled,
  className,
}: TimeInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parse24to12(value);
  const [typedTime, setTypedTime] = useState(`${String(parsed.hour12).padStart(2, "0")}:${parsed.minute}`);
  const [ampm, setAmpm] = useState<"AM" | "PM">(parsed.ampm);

  useEffect(() => {
    const p = parse24to12(value);
    setTypedTime(`${String(p.hour12).padStart(2, "0")}:${p.minute}`);
    setAmpm(p.ampm);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const emit = (h12: number, min: string, ap: "AM" | "PM") => {
    const time24 = to24Hour(h12, min, ap);
    onChange?.(time24);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.trim().toUpperCase();
    input = input.replace(/[^\d:APM ]/g, "");

    let currentAp = ampm;
    if (input.includes("AM")) { currentAp = "AM"; input = input.replace("AM", "").trim(); }
    else if (input.includes("PM")) { currentAp = "PM"; input = input.replace("PM", "").trim(); }

    setTypedTime(input);
    setAmpm(currentAp);

    const digits = input.replace(/[^\d]/g, "");
    if (!input.includes(":") && digits.length > 2) {
      input = `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
      setTypedTime(input);
    }

    const match = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(input);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = match[2] ? match[2].slice(0, 2).padStart(2, "0") : "00";
      if (!isNaN(h) && h >= 0 && h <= 23) {
        if (h >= 13) {
          currentAp = "PM";
          h = h - 12;
          setAmpm("PM");
        } else if (h === 0) {
          currentAp = "AM";
          h = 12;
          setAmpm("AM");
        }
        emit(h, m, currentAp);
      }
    }
  };

  const handleInputBlur = () => {
    const p = parse24to12(value);
    setTypedTime(`${String(p.hour12).padStart(2, "0")}:${p.minute}`);
  };

  const toggleAmPm = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    const nextAp: "AM" | "PM" = ampm === "AM" ? "PM" : "AM";
    setAmpm(nextAp);
    emit(parsed.hour12, parsed.minute, nextAp);
  };

  const selectQuick = (qt: string) => {
    const parts = qt.split(" ");
    const [h, m] = parts[0].split(":");
    const ap = parts[1] as "AM" | "PM";
    setTypedTime(parts[0]);
    setAmpm(ap);
    emit(parseInt(h, 10), m, ap);
    setIsOpen(false);
  };

  const currentDisplayTime12 = `${String(parsed.hour12).padStart(2, "0")}:${parsed.minute} ${ampm}`;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center border border-slate-300 bg-white focus-within:border-slate-950 focus-within:ring-1 focus-within:ring-slate-950">
        <input
          type="text"
          value={typedTime}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          disabled={disabled}
          maxLength={5}
          className="w-12 sm:w-14 text-center py-2 px-1 outline-none font-mono text-xs tabular-nums text-slate-900 bg-transparent"
          placeholder="09:00"
          title="Time (hh:mm)"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-label="Pick time"
          title="Pick time from list"
          className="text-slate-400 hover:text-slate-800 p-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="square" d="M12 7v5l3 3" />
          </svg>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={toggleAmPm}
          title="Click to toggle AM / PM"
          className="px-2 py-2 text-[11px] font-bold font-mono tracking-wider border-l border-slate-200 bg-slate-50 hover:bg-slate-950 hover:text-white transition-colors text-slate-800 select-none"
        >
          {ampm}
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Quick time selection"
          className="absolute right-0 mt-1 z-50 w-36 max-h-48 overflow-y-auto bg-white border border-slate-300 shadow-xl py-1 text-slate-900 font-mono text-xs select-none"
        >
          {QUICK_TIMES.map((qt) => {
            const isSel = qt === currentDisplayTime12;
            return (
              <button
                key={qt}
                type="button"
                onClick={() => selectQuick(qt)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  isSel ? "bg-slate-950 text-white font-bold" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {qt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface DateTimeInputProps {
  value: string; // ISO string "YYYY-MM-DDTHH:mm"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (e: any) => void;
  min?: string; // ISO string "YYYY-MM-DDTHH:mm"
  max?: string; // ISO string "YYYY-MM-DDTHH:mm"
  required?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
}

export function DateTimeInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  name,
  className,
}: DateTimeInputProps) {
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value && value.length >= 16 ? value.slice(11, 16) : "09:00";

  const minDate = min ? min.slice(0, 10) : undefined;
  const maxDate = max ? max.slice(0, 10) : undefined;

  const handleDateChange = (e: { target: { value: string } }) => {
    const newDate = e.target.value;
    if (!newDate) {
      onChange?.({ target: { value: "", name } });
      return;
    }
    const combined = `${newDate}T${timePart || "09:00"}`;
    onChange?.({ target: { value: combined, name } });
  };

  const handleTimeChange = (newTime: string) => {
    const date = datePart || new Date().toISOString().slice(0, 10);
    const combined = `${date}T${newTime || "00:00"}`;
    onChange?.({ target: { value: combined, name } });
  };

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <div className="flex-1 min-w-[115px]">
        <DateInput
          value={datePart}
          onChange={handleDateChange}
          min={minDate}
          max={maxDate}
          required={required}
          disabled={disabled}
          placeholder="DD/MM/YYYY"
        />
      </div>
      <div className="w-[112px] sm:w-[120px] shrink-0">
        <TimeInput
          value={timePart}
          onChange={handleTimeChange}
          disabled={disabled}
          required={required}
        />
      </div>
    </div>
  );
}
