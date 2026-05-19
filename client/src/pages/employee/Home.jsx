import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const EMPLOYEE_TILES = [
  { to: '/my-schedule',      icon: '🗓',  label: 'הלוח שלי',       desc: 'לוח שיבוצים שבועי',      bg: 'bg-blue-500',    hover: 'hover:bg-blue-600',    secretaryHide: true  },
  { to: '/absence',          icon: '⬜',  label: 'דיווח היעדרות',  desc: 'יום מלא או חלקי',        bg: 'bg-slate-500',   hover: 'hover:bg-slate-600',   secretaryHide: true  },
  { to: '/room-query',       icon: '🔍',  label: 'שאילתת חדר',     desc: 'מי נמצא ואיפה',          bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', secretaryHide: false },
  { to: '/one-time-request', icon: '📋',  label: 'בקשת חדר',       desc: 'חדר חד-פעמי',            bg: 'bg-indigo-500',  hover: 'hover:bg-indigo-600',  secretaryHide: true  },
  { to: '/library',          icon: '📚',  label: 'ספרייה',          desc: 'הזמן את הספרייה',        bg: 'bg-purple-500',  hover: 'hover:bg-purple-600',  secretaryHide: false },
  { to: '/meeting-room',     icon: '🤝',  label: 'חדר ישיבות',     desc: 'הזמן חדר ישיבות',        bg: 'bg-teal-500',    hover: 'hover:bg-teal-600',    secretaryHide: false },
  { to: '/mamod',            icon: '🏥',  label: 'ממד',             desc: 'הזמן את הממד',           bg: 'bg-rose-500',    hover: 'hover:bg-rose-600',    secretaryHide: false },
];

export default function Home() {
  const { isSecretary } = useAuth();
  const navigate = useNavigate();

  const tiles = EMPLOYEE_TILES.filter(t => !isSecretary || !t.secretaryHide);

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {tiles.map(t => (
          <button
            key={t.to}
            onClick={() => navigate(t.to)}
            className={`${t.bg} ${t.hover} text-white rounded-2xl p-5 flex flex-col items-center gap-2 shadow-md transition-colors active:scale-95`}
          >
            <span className="text-4xl">{t.icon}</span>
            <span className="font-bold text-base">{t.label}</span>
            <span className="text-xs opacity-80 text-center">{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
