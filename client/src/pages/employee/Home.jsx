import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const EMPLOYEE_TILES = [
  { to: '/my-schedule',      icon: '🗓',  label: 'הלוח שלי',      desc: 'לוח שיבוצים שבועי', color: '#3b82f6', secretaryHide: true  },
  { to: '/absence',          icon: '⬜',  label: 'דיווח היעדרות', desc: 'יום מלא או חלקי',   color: '#64748b', secretaryHide: true  },
  { to: '/room-query',       icon: '🔍',  label: 'שאילתת חדר',    desc: 'מי נמצא ואיפה',     color: '#10b981', secretaryHide: false },
  { to: '/one-time-request', icon: '📋',  label: 'בקשת חדר',      desc: 'חדר חד-פעמי',       color: '#6366f1', secretaryHide: true  },
  { to: '/library',          icon: '📚',  label: 'ספרייה',         desc: 'הזמן את הספרייה',   color: '#a855f7', secretaryHide: false },
  { to: '/meeting-room',     icon: '🤝',  label: 'חדר ישיבות',    desc: 'הזמן חדר ישיבות',   color: '#14b8a6', secretaryHide: false },
  { to: '/mamod',            icon: '🏥',  label: 'ממד',            desc: 'הזמן את הממד',      color: '#f43f5e', secretaryHide: false },
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
            style={{ backgroundColor: t.color }}
            className="text-white rounded-2xl p-5 flex flex-col items-center gap-2 shadow-md active:scale-95 active:brightness-90 hover:brightness-110 transition-all"
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
