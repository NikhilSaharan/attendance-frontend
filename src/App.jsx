import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Calendar, CheckCircle2, Timer, Trash2, Plus, ChevronLeft, ChevronRight, Settings, Wallet, X, Coffee, Check, Pencil, Filter } from 'lucide-react';
import { calculateMonthlyTarget, formatTime } from './utils/dateHelpers';
import { format, addMonths, subMonths, isSameMonth } from 'date-fns';
const API = "https://attendance-backend-8.onrender.com/api";
export default function App() {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [showEarnings, setShowEarnings] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const safeShift = config?.shiftHours || "00:00";
  const [logs, setLogs] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [shortLeaveSelection, setShortLeaveSelection] = useState({ id: null, type: '', hours: 0 });
  const [filterType, setFilterType] = useState('all');

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    inTime: '',
    inPeriod: 'AM',
    outTime: '',
    outPeriod: 'PM',
    isCL: false
  });

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed);
      setConfig(parsed);
    }
  }, []);
  useEffect(() => {
    if (!user) return;

    fetch(`${API}/attendance/${user.id}`)
      .then(res => {
        if (!res.ok) throw new Error("Fetch failed");
        return res.json();
      })
      .then(data => setLogs(data))
      .catch(err => console.error("Error:", err));
  }, [user]);

  const handleTimeInput = (value, field, setterFunc) => {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 4) digits = digits.slice(0, 4);
    let formatted = digits;
    if (digits.length > 2) {
      let hrs = digits.slice(0, 2);
      let mins = digits.slice(2, 4);
      if (parseInt(hrs) > 12 && field !== 'shiftHours') hrs = "12";
      if (parseInt(mins) > 59) mins = "59";
      formatted = `${hrs}:${mins}`;
    } else if (digits.length === 2 && value.length === 2) {
      formatted = `${digits}:`;
    }
    setterFunc(formatted, field);
  };


  const filteredLogs = useMemo(() => logs.filter(log => isSameMonth(new Date(log.date), currentMonth)), [logs, currentMonth]);
  const targetMins = useMemo(() => {
    if (!config || !config.shiftHours) return 0;
    return calculateMonthlyTarget(currentMonth, config);
  }, [currentMonth, config]);

  const displayLogs = useMemo(() => {
    if (!config) return filteredLogs;
    const [sh, sm] = (config?.shiftHours || "00:00").split(':').map(Number);
    const shiftMins = (sh * 60) + sm;
    if (filterType === 'short') {
      return filteredLogs.filter(log => (log.duration < shiftMins) && !log.shortLeaveMins && !log.isCL);
    }
    return filteredLogs;
  }, [filteredLogs, filterType, config]);

  const doneMins = useMemo(() => filteredLogs.reduce((s, l) => s + (l.duration || 0) + (l.shortLeaveMins || 0), 0), [filteredLogs]);
  const remainingMins = targetMins - doneMins;

  const currentSalary = useMemo(() => {
    if (!config || targetMins === 0) return 0;
    if (doneMins >= targetMins) return config.salary;
    const payRatio = doneMins / targetMins;
    return (payRatio * config.salary).toFixed(0);
  }, [doneMins, targetMins, config]);

  const restoreLeave = (log) => {
    if (log.shortLeaveType && log.appliedShortLeaveHours) {
      const key = log.shortLeaveType === 'CL' ? 'clHours' : 'elHours';
      setConfig(prev => ({ ...prev, [key]: Number(prev[key]) + Number(log.appliedShortLeaveHours) }));
    }
  };

  const applyShortLeave = async (id, type, hours) => {
    setLogs(prev => prev.map(log => {
      if (log.id === id) {
        const [sh, sm] = (config?.shiftHours || "00:00").split(':').map(Number);
        const shiftTargetMins = (sh * 60) + sm;
        const gapMins = Math.max(0, shiftTargetMins - log.duration);
        const appliedMins = hours * 60;
        return { ...log, shortLeaveType: type, shortLeaveMins: Math.min(appliedMins, gapMins), appliedShortLeaveHours: hours };
      }
      return log;
    }));

    const key = type === 'CL' ? 'clHours' : 'elHours';
    setConfig(prev => ({ ...prev, [key]: Math.max(0, prev[key] - hours) }));
    await fetch(`${API}/attendance/apply-leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        attendanceId: id,
        type: type,
        hours: hours
      })
    });

    const res = await fetch(`${API}/attendance/${user.id}`);
    const updated = await res.json();
    setLogs(updated);
    setShortLeaveSelection({ id: null, type: '', hours: 0 });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete entry?")) {
      const logToDelete = logs.find(l => l.id === id);
      if (logToDelete) restoreLeave(logToDelete);
      await fetch(`${API}/attendance/${id}`, {
        method: "DELETE"
      });

      const res = await fetch(`${API}/attendance/${user.id}`);
      const updated = await res.json();
      setLogs(updated);
    }
  };

  const get24hMins = (timeStr, period) => {
    if (!timeStr || !timeStr.includes(':')) return null;
    let [hrs, mins] = timeStr.split(':').map(Number);
    if (period === 'PM' && hrs < 12) hrs += 12;
    if (period === 'AM' && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
  };

  const handleEditInit = (log) => {
    setEditingId(log.id);
    setFormData({ date: log.date, inTime: log.inTime || '', inPeriod: 'AM', outTime: log.outTime || '', outPeriod: 'PM', isCL: log.isCL });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e) => {
    e.preventDefault();

    let duration = 0;
    let displayTime = "";

    if (!formData.isCL) {
      let inMins = get24hMins(formData.inTime, formData.inPeriod);
      let outMins = get24hMins(formData.outTime, formData.outPeriod);

      if (!formData.inTime.includes(':') || !formData.outTime.includes(':'))
        return alert("Time sahi se bharein!");

      duration = outMins - inMins;

      if (duration <= 0)
        return alert("Out Time, In Time se pehle nahi ho sakta!");

      displayTime = `${formData.inTime} ${formData.inPeriod} - ${formData.outTime} ${formData.outPeriod}`;
    } else {
      duration = 0;
      displayTime = "Marked Leave (Manual)";
    }

    if (!editingId) {
      const exists = logs.find(l => l.date === formData.date);
      if (exists) return alert("Entry already exists for this date!");
    }
    if (editingId) {
      await fetch(`${API}/attendance/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          date: formData.date,
          inTime: formData.inTime,
          outTime: formData.outTime,
          duration
        })
      });
    } else {
      await fetch(`${API}/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: user.id,
          date: formData.date,
          inTime: formData.inTime,
          outTime: formData.outTime,
          duration,
          shortLeaveMins: 0,
          shortLeaveType: null
        })
      });
    }

    // reload logs
    const res = await fetch(`${API}/attendance/${user.id}`);
    const updated = await res.json();
    setLogs(updated);
    setEditingId(null);

    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      inTime: '',
      outTime: '',
      isCL: false,
      inPeriod: 'AM',
      outPeriod: 'PM'
    });
  };

  if (!config) return (
    <SetupScreen
      onComplete={(u) => {
        setUser(u);
        setConfig(u);
      }}
      handleTimeInput={handleTimeInput}
    />
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-200 animate-pulse-slow"><Clock size={20} /></div>
          <h1 className="text-xl font-black italic tracking-tighter uppercase">Time<span className="text-indigo-600">Track</span></h1>
          <button onClick={() => setIsSettingsOpen(true)} className="ml-2 p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 rounded-full transition-all duration-300 active:rotate-90 cursor-pointer"><Settings size={20} /></button>
        </div>
        <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-xl border border-slate-200">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all active:scale-90 cursor-pointer"><ChevronLeft size={16} /></button>
          <span className="px-4 font-bold text-xs min-w-[100px] text-center">{format(currentMonth, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all active:scale-90 cursor-pointer"><ChevronRight size={16} /></button>
        </div>
      </nav>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md transition-all animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"><X size={24} /></button>
            <h2 className="text-2xl font-black mb-8 text-slate-800 uppercase tracking-tighter">Edit Config</h2>
            <div className="space-y-6 text-left">
              <Input label="Shift Duration" value={config.shiftHours} onChange={v => handleTimeInput(v, 'shiftHours', (val) => setConfig({ ...config, shiftHours: val }))} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="CL Hours" type="number" value={config.clHours} onChange={v => setConfig({ ...config, clHours: v })} />
                <Input label="EL Hours" type="number" value={config.elHours} onChange={v => setConfig({ ...config, elHours: v })} />
              </div>
              <Input label="Monthly Salary" type="number" value={config.salary} onChange={v => setConfig({ ...config, salary: v })} />
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Saturday Policy</label>
                <div className="grid grid-cols-2 gap-3">
                  {[['2nd4th', 'Alternate'], ['all', 'All Working']].map(([val, label]) => (
                    <button key={val} onClick={() => setConfig({ ...config, saturdayRule: val })} className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all border-2 cursor-pointer active:scale-95 ${config.saturdayRule === val ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => { if (window.confirm("Everything will be deleted! Sure?")) { localStorage.clear(); window.location.reload(); } }} className="w-full text-rose-500 text-[10px] font-bold uppercase tracking-widest mt-2 hover:underline cursor-pointer">Reset Everything</button>
              <button onClick={async () => {
                await fetch(`${API}/user/${user.id}`, {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    shiftHours: config.shiftHours,
                    salary: Number(config.salary),
                    clHours: Number(config.clHours),
                    elHours: Number(config.elHours),
                    saturdayRule: config.saturdayRule
                  })
                });

                setIsSettingsOpen(false);
              }} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-indigo-600 transition-all active:scale-[0.98] cursor-pointer  uppercase text-[11px] tracking-widest mt-4">Save Changes</button>
            </div>
          </div>
        </div>
      )}
      {showPinInput && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-6 rounded-2xl w-80">
            <h3 className="font-bold mb-4">Enter PIN</h3>

            <input
              type="password"
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value)}
              className="w-full border p-2 rounded mb-2"
              placeholder="Enter PIN"
            />

            {pinError && (
              <p className="text-red-500 text-sm mb-2">{pinError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (enteredPin === user.pin.toString()) {
                    setShowEarnings(true);
                    setShowPinInput(false);
                  } else {
                    setPinError("Wrong PIN");
                  }
                }}
                className="flex-1 bg-indigo-600 text-white py-2 rounded cursor-pointer hover:bg-indigo-700 transition-all active:scale-95"
              >
                Submit
              </button>

              <button
                onClick={() => setShowPinInput(false)}
                className="flex-1 bg-gray-300 py-2 rounded cursor-pointer hover:bg-gray-400 transition-all active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <main className="max-w-7xl mx-auto px-6 py-10 animate-in slide-in-from-bottom-4 duration-700">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10">
          <StatCard title="Required Hours" value={formatTime(targetMins)} icon={Calendar} color="text-slate-600" bg="bg-slate-100" />
          <StatCard title="Logged Hours" value={formatTime(doneMins)} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard title="Remaining Hours" value={formatTime(remainingMins)} icon={Timer} color={remainingMins > 0 ? "text-cyan-700" : "text-emerald-700"} bg={remainingMins > 0 ? "bg-cyan-50" : "bg-emerald-50"} />
          <div className="bg-white p-7 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-amber-200 hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-500">
            <div className="p-4 w-fit rounded-2xl mb-5 transition-transform group-hover:scale-110 group-hover:rotate-12 bg-amber-50 text-amber-600"><Coffee size={22} /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 leading-none">Leave Balance</p>
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-black text-slate-500">CL</span>
                  <span className="text-2xl font-black tracking-tighter text-amber-600">{Math.floor(config.clHours || 0)}h</span>
                </div>
                <div className="w-[1px] h-6 bg-slate-100"></div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-black text-slate-500">EL</span>
                  <span className="text-2xl font-black tracking-tighter text-amber-600">{Math.floor(config.elHours || 0)}h</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white p-7 pt-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between h-full">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-4 mb-6">
              Earnings
            </p>

            <p className={`text-3xl font-black tracking-tighter mb-6 ${showEarnings ? "text-slate-800" : "text-slate-400"
              }`}>
              {showEarnings
                ? `₹${Number(currentSalary).toLocaleString()}`
                : "****"}
            </p>

            {!showEarnings ? (
              <button
                onClick={() => {
                  setShowPinInput(true);
                  setEnteredPin("");
                  setPinError("");
                }}
                className="mt-auto px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition-all"
              >
                Show
              </button>
            ) : (
              <button
                onClick={() => setShowEarnings(false)}
                className="mt-auto px-4 py-2 bg-gray-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-400 transition-all"
              >
                Hide
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <div className={`bg-white p-8 rounded-[2.5rem] border-2 shadow-xl sticky top-28 transition-all duration-500 ${editingId ? 'border-orange-400 ring-8 ring-orange-400/5' : 'border-slate-200 hover:border-indigo-200'}`}>
              <h2 className="text-lg font-black mb-8 flex items-center gap-2 text-slate-800 tracking-tight">
                <div className="transition-transform duration-500 rotate-0 hover:rotate-180">
                  {editingId ? <Pencil className="bg-orange-500 text-white p-1.5 rounded-lg shadow-lg shadow-orange-200" size={24} /> : <Plus className="bg-indigo-600 text-white p-1 rounded-lg shadow-lg shadow-indigo-200" size={24} />}
                </div>
                {editingId ? 'Edit Entry' : 'Daily Logs'}
              </h2>
              <form onSubmit={handleSave} className="space-y-6">
                <Input label="Date" type="date" value={formData.date} onChange={v => setFormData({ ...formData, date: v })} />
                <button type="button" onClick={() => setFormData({ ...formData, isCL: !formData.isCL })} className={`w-full py-4 rounded-2xl border-2 flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] cursor-pointer hover:shadow-md ${formData.isCL ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                  <Coffee size={18} className={formData.isCL ? "animate-bounce" : ""} />
                  <span className="text-[11px] font-black uppercase tracking-widest">{formData.isCL ? 'Leave Selected' : 'Mark as Leave (Manual)'}</span>
                </button>
                {!formData.isCL && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-end gap-2">
                      <div className="flex-1"><Input label="In Time" placeholder="09:00" maxLength={5} value={formData.inTime} onChange={v => handleTimeInput(v, 'inTime', (val, f) => setFormData(p => ({ ...p, [f]: val })))} /></div>
                      <PeriodToggle value={formData.inPeriod} onChange={v => setFormData({ ...formData, inPeriod: v })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1"><Input label="Out Time" placeholder="06:30" maxLength={5} value={formData.outTime} onChange={v => handleTimeInput(v, 'outTime', (val, f) => setFormData(p => ({ ...p, [f]: val })))} /></div>
                      <PeriodToggle value={formData.outPeriod} onChange={v => setFormData({ ...formData, outPeriod: v })} />
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  {editingId && <button type="button" onClick={() => { setEditingId(null); setFormData({ date: format(new Date(), 'yyyy-MM-dd'), inTime: '', outTime: '', isCL: false, inPeriod: 'AM', outPeriod: 'PM' }); }} className="flex-1 bg-slate-100 text-slate-500 font-black py-5 rounded-2xl hover:bg-slate-200 transition-all cursor-pointer uppercase text-[11px] tracking-widest">Cancel</button>}
                  <button type="submit" className={`flex-[2] text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] cursor-pointer uppercase text-[11px] tracking-widest ${editingId ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200' : 'bg-slate-900 hover:bg-indigo-600 shadow-indigo-200'}`}>
                    {editingId ? 'Update Entry' : 'Save Entry'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm p-2 rounded-2xl border border-slate-200 w-fit shadow-sm">
              <button onClick={() => setFilterType('all')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 flex items-center gap-2 cursor-pointer hover:shadow-md ${filterType === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}>
                All Entries <span className={`px-2 py-0.5 rounded-md text-[8px] transition-colors ${filterType === 'all' ? 'bg-slate-700' : 'bg-slate-100'}`}>{filteredLogs.length}</span>
              </button>
              <button onClick={() => setFilterType('short')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 flex items-center gap-2 cursor-pointer hover:shadow-md ${filterType === 'short' ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'text-slate-400 hover:bg-white hover:text-rose-500'}`}>
                Short Leaves <span className={`px-2 py-0.5 rounded-md text-[8px] transition-colors ${filterType === 'short' ? 'bg-rose-700' : 'bg-slate-100'}`}>
                  {filteredLogs.filter(l => {
                    const [sh, sm] = (config?.shiftHours || "00:00").split(':').map(Number);
                    return (l.duration < (sh * 60 + sm)) && !l.shortLeaveMins && !l.isCL;
                  }).length}
                </span>
              </button>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden hover:border-indigo-100 transition-colors duration-500">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-6">Work Day</th>
                    <th className="px-8 py-6">Time / Short Leave</th>
                    <th className="px-8 py-6">Status</th>
                    <th className="px-8 py-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayLogs
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(log => {
                      const [sh, sm] = (config?.shiftHours || "00:00").split(':').map(Number);
                      const shiftMins = (sh * 60) + sm;
                      const diffMins = (log.duration + (log.shortLeaveMins || 0)) - shiftMins;
                      const gapMins = shiftMins - (log.duration || 0);
                      const isShortDay = gapMins > 0 && !log.shortLeaveMins;

                      // Logic: Apply Leave button tabhi dikhega jab gap >= 120 mins (2 hours) ho
                      const showApplyLeave = isShortDay && !log.shortLeaveType && gapMins >= 120;

                      return (
                        <tr key={log.id} className={`hover:bg-indigo-50/30 group transition-all duration-300 ${editingId === log.id ? 'bg-orange-50/50' : ''}`}>
                          <td className="px-8 py-6 transition-transform group-hover:translate-x-1">
                            <span className="font-bold text-slate-800">{format(new Date(log.date), 'do MMM')}</span>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">{format(new Date(log.date), 'EEEE')}</span>
                          </td>
                          <td className="px-8 py-6">
                            <div className={`font-mono text-sm font-semibold mb-2 transition-colors ${log.isCL ? 'text-indigo-500 italic' : 'text-slate-600 group-hover:text-slate-900'}`}>{log.inTime && log.outTime
                              ? `${log.inTime} ${log.inPeriod || ''} - ${log.outTime} ${log.outPeriod || ''}`
                              : "Leave"}</div>
                            {showApplyLeave && (
                              <div className="relative animate-in zoom-in duration-300">
                                {shortLeaveSelection.id !== log.id ? (
                                  <button onClick={() => setShortLeaveSelection({ id: log.id, type: '', hours: 0 })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border-2 bg-white border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white hover:shadow-lg active:scale-95">
                                    <Coffee size={12} /> Apply Leave Hours
                                  </button>
                                ) : (
                                  <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 mt-2 shadow-inner">
                                    <div className="flex gap-2">
                                      {['CL', 'EL'].map(t => {
                                        const balance = t === 'CL' ? config.clHours : config.elHours;
                                        if (balance <= 0) return null;
                                        return <button key={t} onClick={() => setShortLeaveSelection(p => ({ ...p, type: t }))} className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${shortLeaveSelection.type === t ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300'}`}>{t}</button>;
                                      })}
                                      <button onClick={() => setShortLeaveSelection({ id: null, type: '', hours: 0 })} className="ml-auto text-slate-400 hover:text-rose-500"><X size={14} /></button>
                                    </div>
                                    {shortLeaveSelection.type && (
                                      <select className="text-[10px] p-2 rounded-lg border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-indigo-500 animate-in slide-in-from-top-1" onChange={(e) => applyShortLeave(log.id, shortLeaveSelection.type, Number(e.target.value))}>
                                        <option>Select Hours</option>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(h => h <= (shortLeaveSelection.type === 'CL' ? config.clHours : config.elHours)).map(h => <option key={h} value={h}>{h} Hour{h > 1 ? 's' : ''}</option>)}
                                      </select>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {log.shortLeaveType && <div className="text-indigo-600 font-black text-[9px] uppercase tracking-widest flex items-center gap-1 animate-in fade-in"><Check size={12} className="animate-bounce" /> {log.appliedShortLeaveHours || 0}h {log.shortLeaveType} Applied</div>}
                          </td>
                          <td className="px-8 py-6">
                            <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${log.shortLeaveMins ? 'bg-indigo-100 text-indigo-700 shadow-sm' : (diffMins >= 0 ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'bg-rose-100 text-rose-700')}`}>
                              {(log.shortLeaveMins > 0 && (log.duration + log.shortLeaveMins >= shiftMins)) ? 'SHIFT COMPLETED' : (diffMins >= 0 ? `DONE (+${formatTime(diffMins)})` : formatTime(diffMins))}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                              <button onClick={() => handleEditInit(log)} className="p-2 text-slate-400 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-xl transition-all active:scale-90 cursor-pointer"><Pencil size={16} /></button>
                              <button onClick={() => handleDelete(log.id)} className="p-2 text-rose-300 hover:bg-white hover:text-rose-600 hover:shadow-sm rounded-xl transition-all active:scale-90 cursor-pointer"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {displayLogs.length === 0 && (
                <div className="py-20 text-center animate-in fade-in duration-1000">
                  <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200"><Calendar size={40} /></div>
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">No records found for this month</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <style>
        {`
  @keyframes setupEntry {
    0% {
      opacity: 0;
      transform: translateY(60px) scale(0.9);
    }
    60% {
      opacity: 1;
      transform: translateY(-10px) scale(1.02);
    }
    100% {
      transform: translateY(0) scale(1);
    }
  }

  .animate-setupEntry {
    animation: setupEntry 0.6s ease-out;
  }

  @keyframes bgFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .animate-bgFade {
    animation: bgFade 0.4s ease-in;
  }
  `}
      </style>
    </div>
  );
}

function SetupScreen({ onComplete, handleTimeInput }) {
  const [toast, setToast] = useState({ message: "", type: "" });
  useEffect(() => {
    if (toast.message) {
      const timer = setTimeout(() => {
        setToast({ message: "", type: "" });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toast]);
  const [data, setData] = useState({
    shiftHours: '09:06', salary: '', clHours: '', elHours: '', saturdayRule: '2nd4th', phone: '',
    pin: '',
  });

  const handleLogin = async () => {

    if (data.phone.length !== 10) {
      setToast({ message: "Please enter valid 10 digit mobile number", type: "error" });
      return;
    }

    if (data.pin.length !== 4) {
      setToast({ message: "PIN must be 4 digits", type: "error" });
      return;
    }
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: data.phone,
        pin: data.pin
      })
    });

    // 🔴 LOGIN FAIL → TRY REGISTER
    if (res.status === 401) {

      const registerRes = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phoneNumber: data.phone,
          pin: data.pin,
          shiftHours: data.shiftHours,
          salary: Number(data.salary),
          clHours: Number(data.clHours),
          elHours: Number(data.elHours),
          saturdayRule: data.saturdayRule
        })
      });

      if (!registerRes.ok) {
        const errText = await registerRes.text();
        setToast({ message: errText, type: "error" });
        return;
      }

      const newUser = await registerRes.json();

      setToast({ message: "Account created successfully!", type: "success" });

      const fullUserRes = await fetch(`${API}/user/${newUser.id}`);
      const fullUser = await fullUserRes.json();

      setTimeout(() => {
        onComplete(fullUser);
        localStorage.setItem("user", JSON.stringify(fullUser));
      }, 1000);
    }

    // 🟢 LOGIN SUCCESS
    else if (res.ok) {

      const loginUser = await res.json();
      const userObj = Array.isArray(loginUser) ? loginUser[0] : loginUser;

      if (!userObj) {
        setToast({ message: "Login failed", type: "error" });
        return;
      }

      setToast({ message: "Login successful!", type: "success" });

      const fullUserRes = await fetch(`${API}/user/${userObj.id}`);
      const fullUser = await fullUserRes.json();

      setTimeout(() => {
        onComplete(fullUser);
        localStorage.setItem("user", JSON.stringify(fullUser));
      }, 1000);
    }

    else {
      const errText = await res.text();
      setToast({ message: errText, type: "error" });
    }
  };
  return (

    <div className="min-h-screen bg-[#ECFDF5] flex items-center justify-center p-6 animate-bgFade">
      {toast.message && (
        <div style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "16px 24px",
          borderRadius: "12px",
          fontWeight: "bold",
          color: "white",
          background: toast.type === "success" ? "#22c55e" : "#ef4444",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          zIndex: 9999
        }}>
          {toast.message}
        </div>
      )}
      <div className="bg-white w-full max-w-md rounded-[3rem] p-12 shadow-[0_20px_60px_-15px_rgba(5,150,105,0.15)] 
text-center border border-emerald-100 animate-setupEntry">
        <h2 className="text-3xl font-black mb-10 italic text-emerald-900 uppercase tracking-tighter">User Profile</h2>
        <div className="space-y-8 text-left">
          <input
            type="text"
            placeholder="Phone"
            value={data.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setData({ ...data, phone: digits.slice(0, 10) });
            }}
            className="w-full mb-3 p-3 border rounded"
          />

          {/* 🔐 PIN */}
          <input
            type="password"
            placeholder="Enter 4 digit pin"
            value={data.pin}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setData({ ...data, pin: digits.slice(0, 4) });
            }}
            className="w-full mb-3 p-3 border rounded"
          />

          <Input label="Shift Duration" placeholder="09:06" value={data.shiftHours} onChange={v => handleTimeInput(v, 'shiftHours', (val) => setData({ ...data, shiftHours: val }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CL Hours" type="number" placeholder="12" value={data.clHours} onChange={v => setData({ ...data, clHours: v })} />
            <Input label="EL Hours" type="number" placeholder="24" value={data.elHours} onChange={v => setData({ ...data, elHours: v })} />
          </div>
          <Input label="Monthly Salary" type="number" placeholder="50000" value={data.salary} onChange={v => setData({ ...data, salary: v })} />
          <div>
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Saturday Policy</label>
            <div className="grid grid-cols-2 gap-3">
              {[['2nd4th', 'Alternate'], ['all', 'All Working']].map(([val, label]) => (
                <button key={val} onClick={() => setData({ ...data, saturdayRule: val })} className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all border-2 cursor-pointer active:scale-95 ${data.saturdayRule === val ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}>{label}</button>
              ))}
            </div>
          </div>
          <button
            onClick={handleLogin}
            className="w-full bg-emerald-600 text-white py-3 rounded 
  hover:bg-emerald-700 hover:shadow-xl hover:-translate-y-0.5
  active:scale-95 transition-all duration-200 cursor-pointer"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

const PeriodToggle = ({ value, onChange }) => (
  <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 mb-0.5 shadow-inner">
    {['AM', 'PM'].map(p => (
      <button key={p} type="button" onClick={() => onChange(p)} className={`px-3 py-3 rounded-xl text-[10px] font-black transition-all duration-300 cursor-pointer active:scale-90 ${value === p
        ? 'bg-white text-indigo-600 shadow-sm'
        : 'text-slate-400 hover:text-slate-600 hover:bg-white'
        }`}>{p}</button>
    ))}
  </div>
);

const Input = ({ label, value, onChange, type = "text", placeholder, maxLength }) => (
  <div className="w-full group">
    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1 transition-colors group-focus-within:text-indigo-600">{label}</label>
    <input type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={e => onChange(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all font-bold text-slate-700" />
  </div>
);

const StatCard = ({ title, value, icon: Icon, color, bg, borderColor }) => (
  <div className={`bg-white p-7 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between group transition-all duration-500 hover:shadow-xl hover:-translate-y-1 ${borderColor || 'hover:border-indigo-200'}`}>
    <div className={`p-4 w-fit rounded-2xl mb-5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-sm ${bg} ${color}`}><Icon size={22} /></div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 leading-none group-hover:text-indigo-500 transition-colors">{title}</p>
      <p className={`text-3xl font-black tracking-tighter transition-all duration-300 group-hover:scale-105 origin-left ${color}`}>{value}</p>
    </div>

  </div>
);
