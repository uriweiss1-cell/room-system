import { useState } from 'react';

const PSYCH_URL = 'https://psychology-system.onrender.com/api/public/frameworks';

export default function FrameworkSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(PSYCH_URL);
      if (!res.ok) throw new Error('שגיאה בטעינת נתונים');
      const data = await res.json();
      const filtered = data.filter(f => f.name.includes(q));
      setResults(filtered);
    } catch (e) {
      setError('לא ניתן להתחבר למערכת הפסיכולוגים');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-4">חיפוש מסגרת</h1>
      <div className="flex gap-2 mb-4">
        <input
          className="border rounded px-3 py-2 flex-1 text-sm"
          placeholder="שם גן או בית ספר..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button
          className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800"
          onClick={search}
          disabled={loading}
        >
          {loading ? '...' : 'חיפוש'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {results && (
        results.length === 0
          ? <p className="text-gray-500 text-sm">לא נמצאו תוצאות</p>
          : <div className="space-y-2">
              {results.map((f, i) => (
                <div key={i} className="border rounded p-3 bg-white text-sm">
                  <div className="font-medium text-gray-800">{f.name}</div>
                  <div className="text-gray-500 text-xs mb-1">{f.type === 'kinder' ? 'גן' : 'בית ספר'}</div>
                  {f.psychologists.length > 0
                    ? <div className="space-y-0.5">
                        {f.psychologists.map((p, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <span className="text-blue-700">{p.name}</span>
                            {p.phone && <span className="text-gray-500 text-xs">{p.phone}</span>}
                          </div>
                        ))}
                      </div>
                    : <div className="text-gray-400 italic">לא מאויש</div>
                  }
                </div>
              ))}
            </div>
      )}
    </div>
  );
}
