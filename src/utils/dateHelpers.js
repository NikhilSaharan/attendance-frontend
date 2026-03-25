import {

  isSunday, getDay, getDate, startOfMonth,

  endOfMonth, eachDayOfInterval, format, set

} from 'date-fns';



// 2026 National & Gazetted Holidays (As per your image)

const HOLIDAYS_2026 = [

  "2026-01-26", // Republic Day

  "2026-03-03", // Holi

  "2026-08-15", // Independence Day

  "2026-08-28", // Raksha Bandhan

  "2026-10-02", // Gandhi Jayanti

  "2026-10-21", // Dussehra

  "2026-11-08", // Diwali

  "2026-11-10", // Bhai Dooj

];



export const isWorkingDay = (date, config) => {

  const dateString = format(date, 'yyyy-MM-dd');

  if (isSunday(date)) return false;



  const dayOfWeek = getDay(date);

  if (dayOfWeek === 6) {

    if (config.saturdayRule === '2nd4th') {

      const dayOfMonth = getDate(date);

      const weekOfMonth = Math.ceil(dayOfMonth / 7);

      if (weekOfMonth === 2 || weekOfMonth === 4) return false;

    }

  }



  if (HOLIDAYS_2026.includes(dateString)) return false;

  return true;

};



export const calculateMonthlyTarget = (currentMonth, config) => {

  const start = startOfMonth(currentMonth);

  const end = endOfMonth(currentMonth);

  const days = eachDayOfInterval({ start, end });

 

  const workingDays = days.filter(d => isWorkingDay(d, config)).length;

  const [h, m] = config.shiftHours.split(':').map(Number);

  const dailyMins = (h * 60) + (m || 0);

 

  return workingDays * dailyMins;

};



export const parseSmartTime = (timeStr, isOutTime = false) => {

  if (!timeStr || timeStr.length < 5) return null;

  let [hours, minutes] = timeStr.split(':').map(Number);

 

  // Smart PM logic: If out-time is 1-7, assume PM

  if (isOutTime && hours < 12 && hours > 0) hours += 12;

  else if (!isOutTime && hours < 7) hours += 12;



  return set(new Date(), { hours, minutes, seconds: 0, milliseconds: 0 });

};



export const formatTime = (totalMinutes) => {

  const isNegative = totalMinutes < 0;

  const absMins = Math.abs(totalMinutes);

  const h = Math.floor(absMins / 60);

  const m = Math.floor(absMins % 60);

  return `${isNegative ? '-' : ''}${h}h ${m}m`;

};