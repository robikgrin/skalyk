import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Activity, 
  TrendingUp, 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronRight, 
  Dumbbell,
  ArrowLeft, 
  Trash2, 
  BarChart3, 
  Zap, 
  Battery, 
  BatteryCharging, 
  Play, 
  Pause, 
  RotateCcw, 
  Pencil, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Volume2, 
  ChevronLeft, 
  TrendingDown, 
  Camera, 
  Image as ImageIcon, 
  Maximize2, 
  Tag
} from 'lucide-react';

// --- Types & Schema Interfaces ---

type Tab = 'home' | 'history' | 'training' | 'timer';

interface Project {
  id: string;
  name: string;
  grade: string;
  angle: number; // 0-60 degrees
  totalMoves: number; 
  status: 'active' | 'sent' | 'archived';
  style: string[]; 
  attempts: Attempt[];
  image?: string; // Base64 data URL
  notes?: string; // User arbitrary notes (Beta, location info, etc.)
}

interface Attempt {
  id: string;
  date: string; // ISO String
  outcome: 'send' | 'fall';
  fallMove?: number; 
  progress: number; // 0-100%
  failureReason?: 'power' | 'technique' | 'beta' | 'slip' | 'mental';
}

interface TrainingProtocol {
  id: string;
  title: string;
  description: string;
}

interface Quote {
  text: string;
  character: string;
  source: string;
}

// --- Constants & Mock Data ---

const FRENCH_GRADES = [
  '3', '4', '5a', '5b', '5c', 
  '6a', '6a+', '6b', '6b+', '6c', '6c+', 
  '7a', '7a+', '7b', '7b+', '7c', '7c+', 
  '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'
];

// Helper to convert grade to numeric value for calculations
const getGradeValue = (grade: string): number => {
  const index = FRENCH_GRADES.indexOf(grade);
  return index === -1 ? 0 : index + 3; // Offset to give some weight to lower grades
};

const getGradeCategory = (grade: string) => {
  const i = FRENCH_GRADES.indexOf(grade);
  const i6b = FRENCH_GRADES.indexOf('6b');
  const i6c = FRENCH_GRADES.indexOf('6c');
  
  // Easy: <= 6b -> Citric
  if (i <= i6b) return 'easy';
  // Normal: 6b+ to 6c -> Aquamarine
  if (i <= i6c) return 'normal';
  // Hard: >= 6c+ -> Tangerine
  return 'hard';
};

const MOTIVATIONAL_QUOTES: Quote[] = [
  { text: "Do or do not. There is no try.", character: "Yoda", source: "Star Wars" },
  { text: "It’s dangerous to go alone! Take this.", character: "Old Man", source: "The Legend of Zelda" },
  { text: "Giving up is what kills people.", character: "Alucard", source: "Hellsing" },
  { text: "Hesitation is defeat.", character: "Isshin Ashina", source: "Sekiro: Shadows Die Twice" },
  { text: "Prepare for unforeseen consequences.", character: "G-Man", source: "Half-Life" },
  { text: "The climb is all there is.", character: "Jon Snow", source: "Game of Thrones" },
  { text: "Whatever you do, don't look down.", character: "Shrek", source: "Shrek" },
  { text: "You are not prepared!", character: "Illidan Stormrage", source: "World of Warcraft" },
  { text: "Endure and survive.", character: "Ellie", source: "The Last of Us" },
  { text: "Why do we fall? So we can learn to pick ourselves up.", character: "Alfred Pennyworth", source: "Batman Begins" },
  { text: "Finish him!", character: "Announcer", source: "Mortal Kombat" },
  { text: "Don't be sorry, be better.", character: "Kratos", source: "God of War" }
];

const INITIAL_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'The Pink One',
    grade: '6c',
    angle: 45,
    totalMoves: 12,
    status: 'active',
    style: ['crimp', 'overhang'],
    notes: 'Start is low, big move to the left crimp is the crux. Need to keep right toe hard.',
    attempts: [
      { id: 'a1', date: new Date(Date.now() - 86400000 * 2).toISOString(), outcome: 'fall', fallMove: 4, progress: 33, failureReason: 'beta' },
      { id: 'a2', date: new Date(Date.now() - 86400000 * 2).toISOString(), outcome: 'fall', fallMove: 6, progress: 50, failureReason: 'technique' },
      { id: 'a3', date: new Date(Date.now() - 86400000 * 1).toISOString(), outcome: 'fall', fallMove: 9, progress: 75, failureReason: 'power' },
    ]
  },
  {
    id: '2',
    name: 'Sloper Nightmare',
    grade: '7a+',
    angle: 15,
    totalMoves: 8,
    status: 'active',
    style: ['sloper', 'technical'],
    notes: 'Friction dependant. Come back when it is colder.',
    attempts: []
  }
];

const INITIAL_PROTOCOLS: TrainingProtocol[] = [
  { id: '1', title: 'Max Hangs', description: '10s hang, 3min rest. 5 sets. Use 90% max weight.' },
  { id: '2', title: 'Repeaters 7/3', description: '7s on, 3s off. 6 reps per set. 3 sets total. 5min rest between sets.' },
];

const PRESET_STYLES = ['crimp', 'sloper', 'pinch', 'pocket', 'dyno', 'tech', 'overhang', 'slab', 'comp'];

// --- Main App Component ---

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [viewMode, setViewMode] = useState<'main' | 'project_detail' | 'new_project' | 'edit_project'>('main');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // --- Persistence Logic ---
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('skalyk_projects');
      return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
    } catch (e) {
      console.error("Failed to load projects", e);
      return INITIAL_PROJECTS;
    }
  });

  const [protocols, setProtocols] = useState<TrainingProtocol[]>(() => {
    try {
      const saved = localStorage.getItem('skalyk_protocols');
      return saved ? JSON.parse(saved) : INITIAL_PROTOCOLS;
    } catch (e) {
      return INITIAL_PROTOCOLS;
    }
  });

  const [dailyLogs, setDailyLogs] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('skalyk_logs');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Save effects
  useEffect(() => {
    try {
      localStorage.setItem('skalyk_projects', JSON.stringify(projects));
    } catch (e) {
      alert("Storage Full! Cannot save data. Please delete some projects or images.");
      console.error("Storage quota exceeded", e);
    }
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('skalyk_protocols', JSON.stringify(protocols));
  }, [protocols]);

  useEffect(() => {
    localStorage.setItem('skalyk_logs', JSON.stringify(dailyLogs));
  }, [dailyLogs]);

  // ---

  const activeProject = useMemo(() => 
    projects.find(p => p.id === activeProjectId), 
  [projects, activeProjectId]);

  // Actions
  const handleAddAttempt = (projectId: string, attempt: Attempt) => {
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        const newStatus = attempt.outcome === 'send' ? 'sent' : p.status;
        return {
          ...p,
          status: newStatus,
          attempts: [...p.attempts, attempt]
        };
      }
      return p;
    }));
  };

  const handleUpdateProjectNotes = (projectId: string, notes: string) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, notes } : p));
  };

  const handleCreateProject = (project: Project) => {
    setProjects(prev => [...prev, project]);
    setViewMode('main');
  };

  const handleUpdateProject = (updatedProject: Project) => {
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    setViewMode('project_detail');
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setActiveProjectId(null);
    setViewMode('main');
  };

  const handleUpdateDailyLog = (dateKey: string, text: string) => {
    setDailyLogs(prev => ({
      ...prev,
      [dateKey]: text
    }));
  };

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id);
    setViewMode('project_detail');
  };

  // View Routing
  if (viewMode === 'new_project') {
    return <ProjectFormView onSave={handleCreateProject} onBack={() => setViewMode('main')} />;
  }

  if (viewMode === 'edit_project' && activeProject) {
    return <ProjectFormView initialData={activeProject} onSave={handleUpdateProject} onBack={() => setViewMode('project_detail')} />;
  }

  if (viewMode === 'project_detail' && activeProject) {
    return (
      <ProjectDetailView 
        project={activeProject} 
        onBack={() => setViewMode('main')}
        onEdit={() => setViewMode('edit_project')}
        onDelete={() => handleDeleteProject(activeProject.id)}
        onAddAttempt={(attempt) => handleAddAttempt(activeProject.id, attempt)}
        onUpdateNotes={(notes) => handleUpdateProjectNotes(activeProject.id, notes)}
      />
    );
  }

  return (
    // Changed selection color to Citric
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-lime-400/30 pb-24 flex flex-col">
      <div className="flex-1">
        {activeTab === 'home' && (
          <DashboardView 
            projects={projects} 
            onNewProject={() => setViewMode('new_project')}
            onOpenProject={handleOpenProject}
          />
        )}
        {activeTab === 'history' && (
          <HistoryView 
            projects={projects} 
            dailyLogs={dailyLogs}
            onUpdateLog={handleUpdateDailyLog}
            onOpenProject={handleOpenProject}
          />
        )}
        {activeTab === 'training' && <TrainingView protocols={protocols} setProtocols={setProtocols} />}
        {activeTab === 'timer' && <TimerView />}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

// --- Dashboard View ---

const DashboardView = ({ 
  projects, 
  onNewProject, 
  onOpenProject 
}: { 
  projects: Project[], 
  onNewProject: () => void, 
  onOpenProject: (id: string) => void 
}) => {
  type ChartType = 'load' | 'rate' | 'cumulative' | 'daily_routes' | 'grade_dist';
  const [chartType, setChartType] = useState<ChartType>('load');

  const quote = useMemo(() => MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)], []);

  // --- Calculations ---
  
  const calculateMedianGradeIndex = (status: 'sent' | 'active') => {
    const grades = projects
      .filter(p => p.status === status)
      .map(p => FRENCH_GRADES.indexOf(p.grade))
      .filter(i => i !== -1); 

    if (grades.length === 0) return -1;

    grades.sort((a, b) => a - b);
    const mid = Math.floor(grades.length / 2);

    if (grades.length % 2 !== 0) {
      return grades[mid];
    } else {
      return Math.round((grades[mid - 1] + grades[mid]) / 2);
    }
  };

  let levelIndex = calculateMedianGradeIndex('sent');
  let isProjectedLevel = false;

  if (levelIndex === -1) {
    levelIndex = calculateMedianGradeIndex('active');
    isProjectedLevel = true;
  }
   
  const displayLevel = levelIndex > -1 ? FRENCH_GRADES[levelIndex] : '-';

  const today = new Date();
  const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

  const getVolumeForPeriod = (start: Date, end: Date) => {
    let vol = 0;
    projects.forEach(p => {
      p.attempts.forEach(a => {
        const d = new Date(a.date);
        if (d >= start && d < end) {
          const val = getGradeValue(p.grade);
          vol += val * (a.outcome === 'send' ? 2 : 1);
        }
      });
    });
    return vol;
  };

  const currentVol = getVolumeForPeriod(oneWeekAgo, today);
  const prevVol = getVolumeForPeriod(twoWeeksAgo, oneWeekAgo);
   
  let trendPercent = 0;
  if (prevVol === 0) {
    trendPercent = currentVol > 0 ? 100 : 0;
  } else {
    trendPercent = Math.round(((currentVol - prevVol) / prevVol) * 100);
  }

  const gradeDistData = useMemo(() => {
    const distribution: Record<string, number> = {};
    
    projects.filter(p => p.status === 'sent').forEach(p => {
      distribution[p.grade] = (distribution[p.grade] || 0) + 1;
    });

    return FRENCH_GRADES
      .filter(g => distribution[g] > 0)
      .map(g => ({
        grade: g,
        count: distribution[g],
        category: getGradeCategory(g)
      }));
  }, [projects]);

  const maxDistCount = Math.max(1, ...gradeDistData.map(d => d.count));

  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    
    let runEasy = 0;
    let runNormal = 0;
    let runHard = 0;

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      d.setHours(0,0,0,0);
      
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + 1);

      let attemptsCount = 0;
      let sendsCount = 0;
      let dailyEasy = 0;
      let dailyNormal = 0;
      let dailyHard = 0;

      projects.forEach(p => {
        p.attempts.forEach(a => {
          const aDate = new Date(a.date);
          if (aDate >= d && aDate < nextD) {
             attemptsCount++;
             if (a.outcome === 'send') {
               sendsCount++;
               const cat = getGradeCategory(p.grade);
               if (cat === 'easy') dailyEasy++;
               else if (cat === 'normal') dailyNormal++;
               else dailyHard++;
             }
          }
        });
      });
      
      runEasy += dailyEasy;
      runNormal += dailyNormal;
      runHard += dailyHard;

      data.push({ 
        date: d, 
        attempts: attemptsCount, 
        sends: sendsCount,
        cumEasy: runEasy,
        cumNormal: runNormal,
        cumHard: runHard,
        totalCum: runEasy + runNormal + runHard,
        dailyEasy,
        dailyNormal,
        dailyHard,
        dailyTotal: dailyEasy + dailyNormal + dailyHard
      });
    }
    return data;
  }, [projects]);

  const maxAttempts = Math.max(1, ...chartData.map(d => d.attempts));
  const maxCum = Math.max(1, ...chartData.map(d => d.totalCum));
  const maxDaily = Math.max(1, ...chartData.map(d => d.dailyTotal));

  const readiness = currentVol > 50 ? 'rest' : 'ready';

  return (
    <>
      <header className="p-6 border-b border-zinc-900 flex justify-between items-center bg-zinc-950 sticky top-0 z-50 shadow-md">
      <div className="flex flex-col">
        <img 
          src="text.png" 
          alt="SKALYK Logo"
          className="h-16 w-auto object-contain mb-1" 
        />
      </div>
      
      <button 
        onClick={onNewProject}
        className="bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 p-3 rounded-2xl transition-all"
      >
        <Plus className="w-6 h-6 text-zinc-100" />
      </button>
    </header>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-900 border border-zinc-800 p-5 rounded-[2rem] relative overflow-hidden flex flex-col justify-between min-h-[160px]">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                {readiness === 'ready' ? (
                  // Citric for Ready
                  <BatteryCharging className="w-5 h-5 text-lime-400" />
                ) : (
                  // Tangerine for Rest
                  <Battery className="w-5 h-5 text-orange-500" />
                )}
                <span className="text-1.5xl font-bold uppercase tracking-wider text-zinc-400">Today's Focus</span>
              </div>
              
              {readiness === 'ready' ? (
                <>
                  <h2 className="text-3xl font-black text-white mb-1">TRAIN HARD</h2>
                </>
              ) : (
                <>
                  {/* Active Rest - Tangerine */}
                  <h2 className="text-3xl font-black text-orange-500 mb-1">ACTIVE REST</h2>
                </>
              )}
            </div>
            <div className="relative z-10 mt-4">
               <p className="text-2xl text-zinc-300 italic font-medium leading-tight mb-2">"{quote.text}"</p>
               <p className="text-1.5xl text-zinc-500 font-bold uppercase tracking-wider">— {quote.character}, <span className="text-lime-400">{quote.source}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Карточка Level */}
            <div className="bg-zinc-900 p-5 rounded-[2rem] border border-zinc-800 flex flex-col min-h-[140px]">
              <div className="flex items-center gap-2 text-zinc-500 mb-2">
                <Activity className="w-4 h-4" />
                <span className="text-1.5xl uppercase font-bold tracking-wider">Level</span>
              </div>
              <div className="flex-grow flex flex-col items-center justify-center text-center">
                <span className={`text-4xl font-black leading-none ${isProjectedLevel ? 'text-zinc-500 italic' : 'text-white'}`}>
                  {displayLevel}
                </span>
              </div>
            </div>

            {/* Карточка WEEK Progress */}
            <div className="bg-zinc-900 p-5 rounded-[2rem] border border-zinc-800 flex flex-col min-h-[140px]">
              {/* Citric for success, Tangerine for decline */}
              <div className={`flex items-center gap-2 mb-2 ${trendPercent >= 0 ? 'text-lime-400' : 'text-orange-500'}`}>
                {trendPercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-1.5xl uppercase font-bold tracking-wider">Week progress</span>
              </div>
              <div className="flex-grow flex items-center justify-center text-center">
                <span className={`text-4xl font-black leading-none ${trendPercent >= 0 ? 'text-lime-400' : 'text-orange-500'}`}>
                  {trendPercent > 0 ? '+' : ''}{trendPercent}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-[2rem] p-5">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg pr-2 border border-zinc-800/50">
              <div className="p-2 text-zinc-400"><BarChart3 className="w-4 h-4" /></div>
              <select 
                value={chartType} 
                onChange={(e) => setChartType(e.target.value as ChartType)}
                className="bg-transparent text-sm font-bold text-zinc-300 uppercase tracking-wider outline-none cursor-pointer py-2 hover:text-white appearance-none"
              >
                <option value="load" className="bg-zinc-900 text-white">30 Day Load</option>
                <option value="rate" className="bg-zinc-900 text-white">Success Rate (%)</option>
                <option value="cumulative" className="bg-zinc-900 text-white">Cumulative Progress</option>
                <option value="daily_routes" className="bg-zinc-900 text-white">Daily Routes</option>
                <option value="grade_dist" className="bg-zinc-900 text-white">Grade Distribution</option>
              </select>
            </div>
            {(chartType === 'cumulative' || chartType === 'daily_routes') && (
               <div className="flex gap-2 text-[9px] font-bold uppercase hidden sm:flex">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-lime-400 rounded-full"></div>Citric</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-cyan-400 rounded-full"></div>Aqua</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-500 rounded-full"></div>Tangrine</span>
               </div>
            )}
          </div>
           
          <div className="h-64 pb-4 flex items-end justify-between gap-1">
            {chartType === 'grade_dist' ? (
              gradeDistData.map((item) => {
                const height = (item.count / maxDistCount) * 100;
                const colorClass = 
                  item.category === 'easy' ? 'bg-lime-400' : 
                  item.category === 'normal' ? 'bg-cyan-400' : 'bg-orange-500';

                return (
                  <div key={item.grade} className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer">
                    <div className="absolute bottom-full mb-2 bg-white text-zinc-900 text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none transition-opacity shadow-lg">
                      {item.grade}: {item.count}
                    </div>
                    <div className="relative w-full max-w-[24px] flex items-end h-full">
                      <div className="absolute bottom-0 w-full h-full bg-zinc-800 rounded-sm opacity-10" />
                      <div 
                        style={{ height: `${height}%` }} 
                        className={`w-full ${colorClass} rounded-t-sm shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all duration-500`}
                      />
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-zinc-500">
                      {item.grade}
                    </div>
                  </div>
                );
              })
            ) : (
              chartData.map((day, idx) => {
                let chartBar = null;
                let tooltipContent = null;

                if (chartType === 'load') {
                  const attemptsH = (day.attempts / maxAttempts) * 100;
                  const sendsH = (day.sends / maxAttempts) * 100;
                  tooltipContent = (
                    <div>{day.date.getDate()} {day.date.toLocaleString('default', { month: 'short' })}: {day.sends} Sends / {day.attempts} Attempts</div>
                  );
                  chartBar = (
                    <div className="relative w-full max-w-[16px] flex items-end h-full">
                       {day.attempts > 0 ? (
                          <div style={{ height: `${Math.max(10, attemptsH)}%` }} className="absolute bottom-0 w-full bg-zinc-600 rounded-sm" />
                       ) : (
                          <div className="absolute bottom-0 w-full h-full bg-zinc-800 rounded-sm opacity-20" />
                       )}
                       {day.sends > 0 && (
                          // Citric for sends
                          <div style={{ height: `${Math.max(5, sendsH)}%` }} className="absolute bottom-0 w-full bg-lime-400 z-10 rounded-sm shadow-[0_0_8px_rgba(163,230,53,0.5)]" />
                       )}
                    </div>
                  );
                } else if (chartType === 'rate') {
                  const rate = day.attempts > 0 ? Math.round((day.sends / day.attempts) * 100) : 0;
                  tooltipContent = (
                    <div>{day.date.getDate()} {day.date.toLocaleString('default', { month: 'short' })}: {rate}% ({day.sends}/{day.attempts})</div>
                  );
                  chartBar = (
                    <div className="relative w-full max-w-[16px] flex items-end h-full">
                      <div className="absolute bottom-0 w-full h-full bg-zinc-800 rounded-sm opacity-20" />
                      {day.attempts > 0 && (
                         // Citric for rate
                         <div style={{ height: `${Math.max(2, rate)}%` }} className={`absolute bottom-0 w-full rounded-sm ${rate > 0 ? 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.5)]' : 'bg-zinc-600'}`} />
                      )}
                    </div>
                  );
                } else if (chartType === 'cumulative') {
                  const totalH = maxCum > 0 ? (day.totalCum / maxCum) * 100 : 0;
                  tooltipContent = (
                    <div>
                      <div className="mb-0.5">{day.date.getDate()} {day.date.toLocaleString('default', { month: 'short' })}</div>
                      <div className="flex gap-2 text-[8px]">
                        <span className="text-lime-400">Citric:{day.cumEasy}</span>
                        <span className="text-cyan-400">Aqua:{day.cumNormal}</span>
                        <span className="text-orange-500">Tang:{day.cumHard}</span>
                      </div>
                    </div>
                  );
                  chartBar = (
                    <div className="w-full max-w-[16px] flex flex-col justify-end relative h-full">
                       <div className="w-full h-full bg-zinc-800 rounded-sm opacity-20 absolute" />
                       <div className="relative w-full flex flex-col justify-end" style={{ height: `${totalH}%` }}>
                          <div className="w-full bg-orange-500 rounded-t-sm" style={{ height: `${day.totalCum > 0 ? (day.cumHard / day.totalCum) * 100 : 0}%` }} />
                          <div className="w-full bg-cyan-400" style={{ height: `${day.totalCum > 0 ? (day.cumNormal / day.totalCum) * 100 : 0}%` }} />
                          <div className="w-full bg-lime-400 rounded-b-sm" style={{ height: `${day.totalCum > 0 ? (day.cumEasy / day.totalCum) * 100 : 0}%` }} />
                       </div>
                    </div>
                  );
                } else if (chartType === 'daily_routes') {
                  const totalH = maxDaily > 0 ? (day.dailyTotal / maxDaily) * 100 : 0;
                  tooltipContent = (
                    <div>
                      <div className="mb-0.5">{day.date.getDate()} {day.date.toLocaleString('default', { month: 'short' })}</div>
                      <div className="flex gap-2">
                        <span className="text-lime-400">C:{day.dailyEasy}</span>
                        <span className="text-cyan-400">A:{day.dailyNormal}</span>
                        <span className="text-orange-500">T:{day.dailyHard}</span>
                      </div>
                    </div>
                  );
                  chartBar = (
                    <div className="w-full max-w-[16px] flex flex-col justify-end relative h-full">
                       <div className="w-full h-full bg-zinc-800 rounded-sm opacity-20 absolute" />
                       {day.dailyTotal > 0 && (
                          <div className="relative w-full flex flex-col justify-end" style={{ height: `${Math.max(2, totalH)}%` }}>
                              <div className="w-full bg-orange-500 rounded-t-sm" style={{ height: `${day.dailyTotal > 0 ? (day.dailyHard / day.dailyTotal) * 100 : 0}%` }} />
                              <div className="w-full bg-cyan-400" style={{ height: `${day.dailyTotal > 0 ? (day.dailyNormal / day.dailyTotal) * 100 : 0}%` }} />
                              <div className="w-full bg-lime-400 rounded-b-sm" style={{ height: `${day.dailyTotal > 0 ? (day.dailyEasy / day.dailyTotal) * 100 : 0}%` }} />
                          </div>
                       )}
                    </div>
                  );
                }
                
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer">
                    <div className="absolute bottom-full mb-2 bg-white text-zinc-900 text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none transition-opacity shadow-lg">
                      {tooltipContent}
                    </div>
                    {chartBar}
                    <div className={`mt-2 text-[8px] font-bold ${idx % 5 === 0 || idx === 29 ? 'text-zinc-500' : 'text-transparent'}`}>
                       {idx % 5 === 0 || idx === 29 ? day.date.getDate() : '.'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-zinc-500 mb-4 uppercase tracking-wider flex items-center justify-between">
            <span>Current Projects</span>
            <span className="text-xs bg-zinc-800 px-2 py-1 rounded-md text-zinc-400">{projects.filter(p => p.status === 'active').length} Active</span>
          </h2>
          <div className="space-y-4">
            {projects.filter(p => p.status === 'active').map(project => {
              const bestAttempt = project.attempts.reduce((max, curr) => curr.progress > max ? curr.progress : max, 0);
              return (
                <button 
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  className="w-full bg-zinc-900 p-5 rounded-3xl border border-zinc-800 flex items-center justify-between group active:scale-[0.98] transition-all hover:border-zinc-700 relative overflow-hidden"
                >
                  {project.image && (
                      <img src={project.image} className="absolute inset-0 w-full h-full object-cover opacity-20" alt="" />
                  )}
                  <div className="relative z-10 text-left">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-2xl font-bold italic text-white">{project.grade}</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-400 text-sm font-medium">{project.angle}°</span>
                    </div>
                    <h3 className="font-semibold text-zinc-300 truncate max-w-[150px] sm:max-w-xs">{project.name}</h3>
                  </div>
                  <div className="relative z-10 flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <span className="block text-[10px] text-zinc-500 font-bold mb-1 uppercase tracking-wider">High Point</span>
                      <div className="w-20 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        {/* High point progress - Citric */}
                        <div 
                          className="h-full bg-lime-400" 
                          style={{ width: `${bestAttempt}%` }}
                        />
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-zinc-700 group-hover:text-white transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

// --- History View with Calendar ---

const HistoryView = ({ 
  projects,
  dailyLogs,
  onUpdateLog,
  onOpenProject
}: { 
  projects: Project[],
  dailyLogs: Record<string, string>,
  onUpdateLog: (dateKey: string, text: string) => void,
  onOpenProject: (id: string) => void
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const attemptsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    projects.forEach(p => {
      p.attempts.forEach(a => {
        const dateStr = new Date(a.date).toLocaleDateString('en-CA');
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({ ...a, projectName: p.name, projectGrade: p.grade, projectId: p.id });
      });
    });
    return map;
  }, [projects]);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const changeMonth = (delta: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1));
    setSelectedDate(null);
  };

  const renderCalendar = () => {
    const days = [];
    const emptySlots = firstDayOfMonth;

    for (let i = 0; i < emptySlots; i++) {
      days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const localDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d);
      const isoDate = localDate.toLocaleDateString('en-CA');
      
      const hasAttempts = attemptsByDate[isoDate] && attemptsByDate[isoDate].length > 0;
      const hasLog = dailyLogs[isoDate] && dailyLogs[isoDate].trim().length > 0;
      const hasData = hasAttempts || hasLog;
      const isSelected = selectedDate && selectedDate.getDate() === d && selectedDate.getMonth() === currentMonth.getMonth();

      days.push(
        <button
          key={d}
          onClick={() => setSelectedDate(localDate)}
          className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${
            isSelected 
              ? 'bg-lime-400 text-black font-bold' // Citric Selected
              : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          <span className="text-[20px]">{d}</span>
          {hasData && (
            <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-black' : 'bg-lime-400'}`} />
          )}
        </button>
      );
    }
    return days;
  };

  if (selectedDate) {
    const isoDate = selectedDate.toLocaleDateString('en-CA');
    const dayAttempts = attemptsByDate[isoDate] || [];
    const dayLog = dailyLogs[isoDate] || '';
    
    return (
      <div className="min-h-screen bg-zinc-950 p-6">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setSelectedDate(null)} className="p-2 -ml-2 text-zinc-400 bg-zinc-900 rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-xl font-black text-white">{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
            <p className="text-zinc-500 text-sm font-bold uppercase tracking-wider">Session Details</p>
          </div>
        </div>

        <div className="space-y-6">
          {dayAttempts.length === 0 ? (
            <div className="bg-zinc-900/50 p-6 rounded-3xl text-center border border-zinc-800">
               <p className="text-zinc-500 text-sm">No climbing attempts logged.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayAttempts.map((attempt, idx) => (
                <button 
                  key={idx} 
                  onClick={() => onOpenProject(attempt.projectId)}
                  className="w-full bg-zinc-900 p-4 rounded-2xl flex items-center justify-between border border-zinc-800 hover:border-zinc-600 transition-colors text-left"
                >
                   <div className="flex items-center gap-3">
                      {attempt.outcome === 'send' ? (
                        // Citric for Send
                        <div className="w-8 h-8 rounded-full bg-lime-400/20 flex items-center justify-center text-lime-400">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                          <XCircle className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                          <div className="font-bold text-white text-sm">{attempt.projectName}</div>
                          <div className="text-xs text-zinc-500">
                            {/* Citric Grade */}
                            <span className="text-lime-400 font-bold">{attempt.projectGrade}</span> • {attempt.outcome === 'send' ? 'SENT' : `Fall: Move ${attempt.fallMove}`}
                          </div>
                      </div>
                   </div>
                   <div className="flex items-center gap-3">
                     {attempt.outcome !== 'send' && (
                       <div className="text-xs font-mono text-zinc-600 bg-zinc-950 px-2 py-1 rounded">
                          {attempt.progress}%
                       </div>
                     )}
                     <ChevronRight className="w-4 h-4 text-zinc-600" />
                   </div>
                </button>
              ))}
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Dumbbell className="w-4 h-4" />
              Extra Training & Notes
            </h3>
            {/* Citric focus ring */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-2 focus-within:ring-1 focus-within:ring-lime-400/50 transition-all">
              <textarea 
                value={dayLog}
                onChange={(e) => onUpdateLog(isoDate, e.target.value)}
                placeholder="Log your post-climb workout here (e.g. 5x5 Pullups, Core, Stretching)..."
                className="w-full bg-transparent border-none text-zinc-300 text-sm p-3 focus:outline-none min-h-[100px] resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 p-6">
      <header className="flex justify-between items-center mb-8 sticky top-0 bg-zinc-950 z-50 py-4 border-b border-zinc-900 shadow-sm">
        <h1 className="text-[40px] font-black tracking-tighter text-white">CALENDAR</h1>
        <div className="flex gap-2">
           <button onClick={() => changeMonth(-1)} className="p-2 bg-zinc-900 rounded-xl hover:bg-zinc-800"><ChevronLeft className="w-5 h-5 text-zinc-400" /></button>
           <button onClick={() => changeMonth(1)} className="p-2 bg-zinc-900 rounded-xl hover:bg-zinc-800"><ChevronRight className="w-5 h-5 text-zinc-400" /></button>
        </div>
      </header>
      
      <div className="mb-6">
        {/* Citric for month title */}
        <h2 className="text-lg font-bold text-lime-400 mb-4 uppercase tracking-widest text-center">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        
        <div className="grid grid-cols-7 gap-2 mb-2 text-center">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <span key={i} className="text-[30px] font-bold text-zinc-600">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {renderCalendar()}
        </div>
      </div>
      
      <div className="bg-zinc-900/30 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between">
         <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-lime-400 rounded-full" />
            <span className="text-[20px] text-zinc-400 font-bold uppercase">Activity Recorded</span>
         </div>
         <span className="text-[10px] text-zinc-600">Select a day to view details</span>
      </div>
    </div>
  );
};

// --- Training View with Custom Protocols ---

const TrainingView = ({ protocols, setProtocols }: { protocols: TrainingProtocol[], setProtocols: React.Dispatch<React.SetStateAction<TrainingProtocol[]>> }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    setProtocols([...protocols, { id: Date.now().toString(), title: newTitle, description: newDesc }]);
    setIsAdding(false);
    setNewTitle(' ');
    setNewDesc('');
  };

  const handleDelete = (id: string) => {
    setProtocols(protocols.filter(p => p.id !== id));
  };

  if (isAdding) {
    return (
      <div className="p-6 min-h-screen bg-zinc-950">
         <div className="flex items-center gap-4 mb-8 pt-4">
          <button onClick={() => setIsAdding(false)} className="p-2 -ml-2 text-zinc-400"><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-2xl font-black text-white">NEW PROTOCOL</h1>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Protocol Name</label>
            <input 
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Max Hangs"
              // Citric Focus Border
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white text-lg focus:outline-none focus:border-lime-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Description / Plan</label>
            <textarea 
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Describe sets, reps, rests..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-lime-400 min-h-[150px]"
            />
          </div>
          <button onClick={handleAdd} className="w-full py-5 bg-lime-400 text-black rounded-3xl font-black text-xl mt-4">SAVE PROTOCOL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pt-12 bg-zinc-950 min-h-screen pb-24">
      <div className="flex justify-between items-end mb-6">
        <h1 className="text-[40px] font-black text-white">PLANS</h1>
        {/* Citric Button Style */}
        <button onClick={() => setIsAdding(true)} className="text-lime-400 font-bold text-sm bg-lime-400/10 px-4 py-2 rounded-xl border border-lime-400/20 hover:bg-lime-400/20">+ ADD</button>
      </div>
      
      <div className="space-y-4">
        {protocols.length === 0 ? (
          <p className="text-zinc-500 text-center py-10">No protocols yet. Create one!</p>
        ) : (
          protocols.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-[2rem] overflow-hidden transition-all">
                <button 
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-zinc-800/50"
                >
                  <span className="font-bold text-lg text-white">{p.title}</span>
                  {isExpanded ? <ChevronUp className="text-zinc-500" /> : <ChevronDown className="text-zinc-500" />}
                </button>
                {isExpanded && (
                  <div className="px-6 pb-6 pt-0">
                    <div className="h-px bg-zinc-800 mb-4 w-full"></div>
                    <p className="text-zinc-400 whitespace-pre-wrap leading-relaxed mb-6">
                      {p.description || "No description provided."}
                    </p>
                    <div className="flex justify-end">
                      <button 
                        onClick={() => handleDelete(p.id)}
                        // Tangerine for Delete
                        className="flex items-center gap-2 text-orange-500 bg-orange-500/10 px-4 py-2 rounded-xl text-sm font-bold"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// --- Timer View with Stopwatch & Alert ---

// --- Timer View with Stopwatch & Alert ---

const TimerView = () => {
    const [mode, setMode] = useState<'stopwatch' | 'timer'>('stopwatch');
    
    // Stopwatch State
    const [swTime, setSwTime] = useState(0);
    const [swRunning, setSwRunning] = useState(false);
  
    // Timer State
    const [timerInputMin, setTimerInputMin] = useState(2);
    const [timerInputSec, setTimerInputSec] = useState(0);
    const [timerLeft, setTimerLeft] = useState(120000); // ms
    const [timerRunning, setTimerRunning] = useState(false);
  
    // Audio Context for Beep
    const playAlertSound = () => {
      const audio = new Audio('/gong-1.mp3');
      audio.play();
    };
  
    // Stopwatch Logic
    useEffect(() => {
      let interval: any;
      if (swRunning) {
        interval = setInterval(() => setSwTime(t => t + 10), 10);
      }
      return () => clearInterval(interval);
    }, [swRunning]);
  
    // Timer Logic
    useEffect(() => {
      let interval: any;
      if (timerRunning && timerLeft > 0) {
        interval = setInterval(() => {
          setTimerLeft(t => {
            if (t <= 10) {
               setTimerRunning(false);
               playAlertSound();
               return 0;
            }
            return t - 10;
          });
        }, 10);
      }
      return () => clearInterval(interval);
    }, [timerRunning, timerLeft]);
  
    const format = (ms: number) => {
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      const cent = Math.floor((ms % 1000) / 10);
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${cent.toString().padStart(2, '0')}`;
    };
  
    const handleTimerStart = () => {
      if (!timerRunning && timerLeft === 0) {
         // Reset if starting from 0
         setTimerLeft((timerInputMin * 60 + timerInputSec) * 1000);
      }
      setTimerRunning(!timerRunning);
    };
  
    const handleTimerReset = () => {
      setTimerRunning(false);
      setTimerLeft((timerInputMin * 60 + timerInputSec) * 1000);
    };
  
    return (
      <div className="p-6 flex flex-col items-center min-h-[80vh]">
        {/* Mode Switcher */}
        <div className="bg-zinc-900 p-1 rounded-2xl flex gap-1 mb-12 border border-zinc-800 mt-12">
          <button 
            onClick={() => setMode('stopwatch')}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all ${mode === 'stopwatch' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500'}`}
          >
            Stopwatch
          </button>
          <button 
            onClick={() => setMode('timer')}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all ${mode === 'timer' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500'}`}
          >
            Timer
          </button>
        </div>
  
        {mode === 'stopwatch' ? (
          <div className="flex flex-col items-center w-full">
            <div className="mb-12 relative">
              <span className="font-mono text-6xl md:text-8xl font-black tracking-tighter text-white tabular-nums">
                {format(swTime)}
              </span>
              <p className="text-center text-zinc-500 font-bold uppercase tracking-widest mt-2">Elapsed Time</p>
            </div>
            
            <div className="flex gap-4 w-full max-w-sm">
              <button 
                onClick={() => setSwRunning(!swRunning)}
                className={`flex-1 py-8 rounded-[2rem] flex items-center justify-center gap-2 text-xl font-black transition-all ${
                  swRunning ? 'bg-zinc-800 text-white' : 'bg-lime-400 text-zinc-950'
                }`}
              >
                {swRunning ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                {swRunning ? 'PAUSE' : 'START'}
              </button>
              <button 
                onClick={() => { setSwRunning(false); setSwTime(0); }}
                className="aspect-square rounded-[2rem] bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 hover:text-white"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            {/* Timer Display */}
            <div className="mb-8 text-center">
               <div className="font-mono text-6xl md:text-8xl font-black tracking-tighter text-white tabular-nums mb-2">
                 {format(timerLeft)}
               </div>
               <p className="text-lime-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                 <Volume2 className="w-4 h-4" /> Sound On
               </p>
            </div>
  
            {/* Controls */}
            <div className="flex gap-4 w-full max-w-sm mb-10">
              <button 
                onClick={handleTimerStart}
                className={`flex-1 py-8 rounded-[2rem] flex items-center justify-center gap-2 text-xl font-black transition-all ${
                  timerRunning ? 'bg-zinc-800 text-white' : 'bg-lime-400 text-zinc-950'
                }`}
              >
                {timerRunning ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                {timerRunning ? 'PAUSE' : 'START'}
              </button>
              <button 
                onClick={handleTimerReset}
                className="aspect-square rounded-[2rem] bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 hover:text-white"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
            </div>
  
            {/* Time Input Settings */}
            <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800 w-full max-w-sm">
               <h3 className="text-zinc-500 font-bold uppercase text-xs mb-4">Set Duration</h3>
               <div className="flex gap-4 items-center justify-center">
                  
                  {/* MINUTES INPUT */}
                  <div className="flex flex-col items-center">
                    <input 
                      type="number" 
                      min="0" // Блокирует ввод минуса стрелками
                      value={timerInputMin}
                      onChange={(e) => {
                        // Math.max(0, ...) не дает уйти в минус при ручном вводе
                        // parseInt убирает ведущий ноль (05 -> 5)
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setTimerInputMin(val);
                        if (!timerRunning) setTimerLeft((val * 60 + timerInputSec) * 1000);
                      }}
                      className="w-20 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-2xl font-bold text-center text-white focus:outline-none focus:border-lime-400 transition-colors" 
                    />
                    <span className="text-xs text-zinc-500 mt-2 font-bold">MIN</span>
                  </div>
  
                  <span className="text-2xl font-bold text-zinc-700">:</span>
                  
                  {/* SECONDS INPUT */}
                  <div className="flex flex-col items-center">
                    <input 
                      type="number" 
                      min="0" // Блокирует ввод минуса стрелками
                      value={timerInputSec}
                      onChange={(e) => {
                        // Math.max(0, ...) не дает уйти в минус при ручном вводе
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setTimerInputSec(val);
                        if (!timerRunning) setTimerLeft((timerInputMin * 60 + val) * 1000);
                      }}
                      className="w-20 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-2xl font-bold text-center text-white focus:outline-none focus:border-lime-400 transition-colors" 
                    />
                    <span className="text-xs text-zinc-500 mt-2 font-bold">SEC</span>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    );
  };

// --- Project Form View ---

const ProjectFormView = ({ initialData, onSave, onBack }: { initialData?: Project, onSave: (p: Project) => void, onBack: () => void }) => {
  const [formData, setFormData] = useState<Partial<Project>>(initialData || {
    name: '',
    grade: '6a',
    angle: 40,
    totalMoves: 0,
    style: [],
    status: 'active',
    attempts: [],
    notes: '',
    image: undefined
  });
  
  const [tagInput, setTagInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      attempts: [],
      ...formData
    } as Project);
  };

  const toggleStyle = (s: string) => {
    const current = formData.style || [];
    if (current.includes(s)) setFormData({ ...formData, style: current.filter(x => x !== s) });
    else setFormData({ ...formData, style: [...current, s] });
  };
  
  const handleAddTag = () => {
     const trimmed = tagInput.trim();
     if (trimmed && !(formData.style || []).includes(trimmed)) {
        setFormData({ ...formData, style: [...(formData.style || []), trimmed] });
     }
     setTagInput('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        // Compress image before saving to prevent LocalStorage quota overflow
        const img = new Image();
        img.onload = () => {
           const canvas = document.createElement('canvas');
           let width = img.width;
           let height = img.height;
           const MAX_SIZE = 800; // Resize to max 800px

           if (width > height) {
             if (width > MAX_SIZE) {
               height *= MAX_SIZE / width;
               width = MAX_SIZE;
             }
           } else {
             if (height > MAX_SIZE) {
               width *= MAX_SIZE / height;
               height = MAX_SIZE;
             }
           }
           canvas.width = width;
           canvas.height = height;
           const ctx = canvas.getContext('2d');
           ctx?.drawImage(img, 0, 0, width, height);
           // Save as JPEG 0.6 quality
           setFormData({ ...formData, image: canvas.toDataURL('image/jpeg', 0.6) });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 pb-24">
      <header className="flex items-center gap-4 mb-8 pt-4">
        <button onClick={onBack} className="p-2 -ml-2 bg-zinc-900 rounded-full text-zinc-400">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-black text-white">{initialData ? 'EDIT PROJECT' : 'NEW PROJECT'}</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Image Upload Section */}
        <div 
           onClick={() => fileInputRef.current?.click()}
           className="w-full h-48 rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center cursor-pointer hover:border-lime-400/50 hover:bg-zinc-900 transition-all relative overflow-hidden group"
        >
           <input 
             type="file" 
             ref={fileInputRef} 
             className="hidden" 
             accept="image/*" 
             onChange={handleImageUpload} 
           />
           {formData.image ? (
              <>
                 <img src={formData.image} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity" alt="Preview" />
                 <div className="relative z-10 bg-black/50 p-2 rounded-full backdrop-blur-sm">
                    <Camera className="w-6 h-6 text-white" />
                 </div>
              </>
           ) : (
              <>
                 <div className="bg-zinc-900 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform">
                    <Camera className="w-8 h-8 text-zinc-500" />
                 </div>
                 <span className="text-xs font-bold text-zinc-500 uppercase">Tap to add photo</span>
              </>
           )}
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Project Name</label>
          <input 
            type="text" 
            required
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:border-lime-400 outline-none transition-colors"
            placeholder="e.g. The Pink One"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div>
             <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Grade</label>
             <select 
               value={formData.grade}
               onChange={e => setFormData({...formData, grade: e.target.value})}
               className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:border-lime-400 outline-none appearance-none"
             >
               {FRENCH_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
             </select>
           </div>
           <div>
             <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Angle ({formData.angle}°)</label>
             <input 
               type="range" 
               min="0" max="60" step="5"
               value={formData.angle}
               onChange={e => setFormData({...formData, angle: parseInt(e.target.value)})}
               className="w-full h-12 accent-lime-400"
             />
           </div>
        </div>

        <div>
           <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Total Moves</label>
           <input 
             type="number"
             value={formData.totalMoves || ''}
             onChange={e => setFormData({...formData, totalMoves: parseInt(e.target.value)})}
             className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:border-lime-400 outline-none"
             placeholder="0"
           />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Style Tags</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {(formData.style || []).map(s => (
              <button
                type="button"
                key={s}
                onClick={() => toggleStyle(s)}
                // Citric bg, Tangerine hover
                className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-lime-400 border-lime-400 text-black flex items-center gap-1 hover:bg-orange-500 hover:border-orange-500 hover:text-white group transition-colors"
              >
                {s} <X className="w-3 h-3 group-hover:text-white text-black/50" />
              </button>
            ))}
          </div>
          
          <div className="flex gap-2 mb-4">
             <div className="relative flex-1">
                <Tag className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                <input 
                   type="text"
                   value={tagInput}
                   onChange={(e) => setTagInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                   className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-lime-400 outline-none"
                   placeholder="Add custom tag..."
                />
             </div>
             <button 
               type="button"
               onClick={handleAddTag} 
               className="bg-zinc-800 text-white rounded-xl px-4 hover:bg-zinc-700 active:bg-zinc-600"
             >
                <Plus className="w-5 h-5" />
             </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] font-bold text-zinc-600 uppercase w-full">Suggestions:</span>
            {PRESET_STYLES.filter(s => !(formData.style || []).includes(s)).map(s => (
              <button
                type="button"
                key={s}
                onClick={() => toggleStyle(s)}
                className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-900"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button 
          type="submit"
          className="w-full bg-lime-400 text-black font-bold uppercase tracking-wider p-4 rounded-xl mt-8 hover:bg-lime-300 active:scale-[0.98] transition-all"
        >
          Save Project
        </button>
      </form>
    </div>
  );
};

// --- Project Detail View ---

const ProjectDetailView = ({ 
  project, 
  onBack, 
  onEdit, 
  onDelete,
  onAddAttempt,
  onUpdateNotes
}: { 
  project: Project, 
  onBack: () => void, 
  onEdit: () => void, 
  onDelete: () => void,
  onAddAttempt: (a: Attempt) => void,
  onUpdateNotes: (n: string) => void
}) => {
  const [showLogModal, setShowLogModal] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [newAttempt, setNewAttempt] = useState<Partial<Attempt>>({
    outcome: 'fall',
    progress: 0,
    fallMove: 0,
    failureReason: 'power'
  });

  const handleSaveAttempt = () => {
    onAddAttempt({
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      outcome: newAttempt.outcome || 'fall',
      progress: newAttempt.outcome === 'send' ? 100 : (newAttempt.progress || 0),
      fallMove: newAttempt.outcome === 'send' ? undefined : newAttempt.fallMove,
      failureReason: newAttempt.outcome === 'send' ? undefined : newAttempt.failureReason,
    } as Attempt);
    setShowLogModal(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 relative">
       {/* Background Image / Gradient */}
       <div className="h-96 bg-gradient-to-b from-zinc-800 to-zinc-950 relative group">
          {project.image ? (
             <img src={project.image} className="w-full h-full object-cover opacity-60 mask-image-b-fade" alt="" />
          ) : (
             <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-700">
                <ImageIcon className="w-16 h-16 opacity-20" />
             </div>
          )}
          
          <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-10 pt-8 bg-gradient-to-b from-black/80 to-transparent pb-12">
             <button onClick={onBack} className="p-2 bg-black/50 backdrop-blur rounded-full text-white hover:bg-zinc-800"><ArrowLeft /></button>
             <div className="flex gap-2">
                {project.image && (
                   <button onClick={() => setShowImage(true)} className="p-2 bg-black/50 backdrop-blur rounded-full text-white hover:bg-zinc-800"><Maximize2 className="w-5 h-5" /></button>
                )}
                {/* Tangerine for Delete */}
                <button onClick={onDelete} className="p-2 bg-black/50 backdrop-blur rounded-full text-orange-500 hover:bg-orange-500/20"><Trash2 className="w-5 h-5" /></button>
                <button onClick={onEdit} className="p-2 bg-black/50 backdrop-blur rounded-full text-white hover:bg-zinc-800"><Pencil className="w-5 h-5" /></button>
             </div>
          </div>
          
          <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent pt-24">
             <div className="flex items-end justify-between">
                <div>
                   <h1 className="text-4xl font-black text-white leading-none mb-3 drop-shadow-lg">{project.name}</h1>
                   <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-lime-400 text-black text-xs font-bold rounded-md">{project.grade}</span>
                      <span className="text-zinc-400 text-xs font-bold uppercase">{project.angle}° Wall</span>
                      {project.style.map(s => (
                         <span key={s} className="text-zinc-500 text-[10px] font-bold uppercase border border-zinc-800 px-2 py-0.5 rounded">{s}</span>
                      ))}
                   </div>
                </div>
             </div>
          </div>
       </div>

       <div className="p-6 space-y-8 -mt-4 relative z-10">
          {/* Action Buttons */}
          <button 
             onClick={() => setShowLogModal(true)}
             // Citric Shadow
             className="w-full bg-lime-400 text-black font-black uppercase tracking-wider p-4 rounded-2xl shadow-[0_0_20px_rgba(163,230,53,0.3)] hover:shadow-[0_0_30px_rgba(163,230,53,0.5)] transition-all active:scale-[0.98]"
          >
             Log Attempt
          </button>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
             <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-zinc-500 text-[10px] font-bold uppercase mb-1">Attempts</div>
                <div className="text-xl font-black text-white">{project.attempts.length}</div>
             </div>
             <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-zinc-500 text-[10px] font-bold uppercase mb-1">High Point</div>
                <div className="text-xl font-black text-lime-400">
                  {Math.max(0, ...project.attempts.map(a => a.progress))}%
                </div>
             </div>
             <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-zinc-500 text-[10px] font-bold uppercase mb-1">Status</div>
                <div className={`text-xl font-black uppercase ${project.status === 'sent' ? 'text-lime-400' : 'text-zinc-300'}`}>
                   {project.status}
                </div>
             </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Beta & Notes</h3>
            <textarea 
               value={project.notes || ''}
               onChange={(e) => onUpdateNotes(e.target.value)}
               // Citric Focus
               className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-zinc-300 text-sm min-h-[100px] focus:outline-none focus:border-lime-400/50"
               placeholder="Write down your sequence..."
            />
          </div>

          {/* History */}
          <div>
             <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">History</h3>
             <div className="space-y-3">
                {[...project.attempts].reverse().map((attempt) => (
                   <div key={attempt.id} className="flex items-center justify-between p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
                      <div className="flex items-center gap-3">
                         {attempt.outcome === 'send' ? <CheckCircle className="text-lime-400 w-5 h-5" /> : <XCircle className="text-zinc-600 w-5 h-5" />}
                         <div>
                            <div className="text-sm font-bold text-zinc-200">
                               {new Date(attempt.date).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-zinc-500">
                               {attempt.outcome === 'send' ? 'Sent!' : `Fall on move ${attempt.fallMove} (${attempt.failureReason})`}
                            </div>
                         </div>
                      </div>
                      <div className="text-xs font-mono text-zinc-600">{attempt.progress}%</div>
                   </div>
                ))}
                {project.attempts.length === 0 && <p className="text-center text-zinc-600 text-sm py-4">No attempts logged yet.</p>}
             </div>
          </div>
       </div>

       {/* Log Modal Overlay */}
       {showLogModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
             <div className="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-800 space-y-6">
                <div className="flex justify-between items-center">
                   <h2 className="text-xl font-black text-white">LOG ATTEMPT</h2>
                   <button onClick={() => setShowLogModal(false)}><X className="text-zinc-500" /></button>
                </div>

                <div className="flex gap-2">
                   <button 
                      onClick={() => setNewAttempt({...newAttempt, outcome: 'send'})}
                      // Citric for Send
                      className={`flex-1 p-4 rounded-xl font-bold border-2 transition-all ${newAttempt.outcome === 'send' ? 'border-lime-400 bg-lime-400/20 text-lime-400' : 'border-zinc-800 text-zinc-500'}`}
                   >
                      SEND
                   </button>
                   <button 
                      onClick={() => setNewAttempt({...newAttempt, outcome: 'fall'})}
                      // Tangerine for Fall
                      className={`flex-1 p-4 rounded-xl font-bold border-2 transition-all ${newAttempt.outcome === 'fall' ? 'border-orange-500 bg-orange-500/20 text-orange-500' : 'border-zinc-800 text-zinc-500'}`}
                   >
                      FALL
                   </button>
                </div>

                {newAttempt.outcome === 'fall' && (
                   <div className="space-y-4 animate-in slide-in-from-top-2">
                      <div>
                         <label className="text-xs font-bold text-zinc-500 uppercase">Fall Move / Total ({project.totalMoves})</label>
                         <input 
                            type="number" 
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white mt-1"
                            value={newAttempt.fallMove}
                            onChange={(e) => {
                               const move = parseInt(e.target.value);
                               const progress = project.totalMoves > 0 ? Math.round((move / project.totalMoves) * 100) : 0;
                               setNewAttempt({...newAttempt, fallMove: move, progress});
                            }}
                         />
                      </div>
                      <div>
                         <label className="text-xs font-bold text-zinc-500 uppercase">Reason</label>
                         <div className="flex flex-wrap gap-2 mt-1">
                            {['power', 'technique', 'beta', 'slip', 'mental'].map(r => (
                               <button 
                                  key={r}
                                  onClick={() => setNewAttempt({...newAttempt, failureReason: r as any})}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                     newAttempt.failureReason === r ? 'bg-zinc-100 text-black border-white' : 'border-zinc-800 text-zinc-500'
                                  }`}
                               >
                                  {r}
                               </button>
                            ))}
                         </div>
                      </div>
                   </div>
                )}

                <button 
                   onClick={handleSaveAttempt}
                   className="w-full bg-white text-black font-bold p-4 rounded-xl hover:bg-zinc-200"
                >
                   SAVE ENTRY
                </button>
             </div>
          </div>
       )}
       
       {/* Image Modal */}
       {showImage && project.image && (
          <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowImage(false)}>
            <button className="absolute top-6 right-6 p-2 bg-zinc-800 rounded-full text-white"><X className="w-6 h-6" /></button>
            <img src={project.image} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
       )}
    </div>
  );
};

// --- Bottom Navigation ---

const BottomNav = ({ activeTab, onTabChange }: { activeTab: Tab, onTabChange: (t: Tab) => void }) => {
  const tabs: { id: Tab, icon: any, label: string }[] = [
    { id: 'home', icon: Activity, label: 'Train' },
    { id: 'history', icon: CalendarIcon, label: 'Calendar' },
    { id: 'training', icon: Dumbbell, label: 'Plans' },
    { id: 'timer', icon: Clock, label: 'Timer' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 pb-safe pt-2 px-6 h-20 flex justify-around items-start z-40">
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button 
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-col items-center gap-1 w-16 group"
          >
             <div className={`p-2 rounded-2xl transition-all duration-300 ${isActive ? 'bg-lime-400 text-black translate-y-[-10px] shadow-lg shadow-lime-400/20' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                <Icon className="w-6 h-6" />
             </div>
             <span className={`text-[10px] font-bold uppercase transition-all ${isActive ? 'text-lime-400 translate-y-[-8px]' : 'text-zinc-600'}`}>
                {tab.label}
             </span>
          </button>
        );
      })}
    </div>
  );
};

const styleElement = document.createElement('style');
styleElement.innerHTML = `
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background-color: #09090b; /* Цвет bg-zinc-950, чтобы не было белых полос при загрузке */
    overflow-x: hidden; /* Убираем горизонтальную прокрутку */
    -webkit-tap-highlight-color: transparent;
  }
   
  /* Скрываем полосы прокрутки для более "нативного" вида */
  ::-webkit-scrollbar {
    width: 0px;
    background: transparent;
  }
`;
document.head.appendChild(styleElement);

const root = createRoot(document.getElementById('root')!);
root.render(<App />);