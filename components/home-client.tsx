'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Navbar, viewForPath } from '@/components/navbar';
import { FilterPanel, FilterState } from '@/components/filter-panel';
import { EventList, type BoardSeed } from '@/components/event-list';
import { SavedBoard } from '@/components/saved-board';
import { Footer } from '@/components/footer';
import { CATEGORIES, areasForCity, knownCategories, withCategories } from '@/lib/categories';
import { addDays, categoryIcon, sydneyNow, type SydneyNow, type TimeWindow } from '@/lib/board';
import { useSaved } from '@/lib/saved';
import { CalendarDays, Check, LayoutGrid, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CITIES, DEFAULT_CITY } from '@/lib/cities';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { FeaturedTurnstile } from '@/components/featured-turnstile';
import { HomeRails } from '@/components/home-rails';
import { SuggestionButton } from '@/components/suggestion-button';
import { LocalClock } from '@/components/local-clock';
import { AiSearchBar, type AiSearchFilters } from '@/components/ai-search-bar';
import { useBackState } from '@/lib/scroll-memory';
import { readCity, readUserCity, resolveBoardCity, writeCity, writeUserCity } from '@/lib/city-pref';
const MapView = dynamic(() => import('@/components/map-view').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Loading the map…</div>,
});

const EMPTY_FILTERS: FilterState = {
  category: '', categories: [], subTag: '', suburb: '', isFree: false, isLGBTI: false, dateFrom: '', dateTo: '', datePreset: ''
};
const CAT_KEY = 'se-categories-v1';
const FILTER_OWNER = 'outza-filter-owner';
const DAYS_AHEAD = 30;

const WINDOWS: {key: TimeWindow;label: string;todayOnly?: boolean;}[] = [
{ key: 'now', label: 'Now & next', todayOnly: true },
{ key: 'hour', label: 'Next 60 min', todayOnly: true },
{ key: 'evening', label: 'Evening' },
{ key: 'all', label: 'Full day' }];


export function HomeClient({ initialNow, initialBoard = null }: { initialNow: SydneyNow; initialBoard?: BoardSeed | null }) {
  // Board, Map and Saved are real addresses (/, /map, /saved) sharing this layout.
  // City is shared. Category, date and area filters are per view, so Music on the board does not filter the map.
  const router = useRouter();
  const view = viewForPath(usePathname()) ?? 'board';
  const goView = (v: 'board' | 'map' | 'saved') => router.push(v === 'board' ? '/' : `/${v}`);
  // Board choices are remembered so Back from an event returns to the same board and scroll spot.
  const [searchInput, setSearchInput] = useBackState('home:search', '');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  // Board and map keep their own filters. City is shared. Music on the board does not follow you onto /map.
  const [boardFilters, setBoardFilters] = useBackState<FilterState>('home:filters', EMPTY_FILTERS);
  const [mapFilters, setMapFilters] = useBackState<FilterState>('map:filters', EMPTY_FILTERS);
  const filters = view === 'map' ? mapFilters : boardFilters;
  const setFilters = view === 'map' ? setMapFilters : setBoardFilters;
  const [now, setNow] = useState<SydneyNow | null>(initialNow);
  const [day, setDay] = useBackState<string | null>('home:day', initialNow.date);
  // Full day matches the "Today" date chip. Ended rows stay hidden until "Show ended".
  const [timeWindow, setTimeWindow] = useBackState<TimeWindow>('home:window', 'all');
  const [windowPinned, setWindowPinned] = useState(false);
  const [city, setCityState] = useState<string>(DEFAULT_CITY);
  const [catsHydrated, setCatsHydrated] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState<Date | undefined>(undefined);
  const { saved } = useSaved();
  const { data: session, status: authStatus } = useSession();
  const userId = authStatus === 'authenticated' ? session?.user?.id ?? null : null;
  const boardRef = useRef<HTMLDivElement>(null);
  const cityTouched = useRef(false);
  const setCity = (c: string) => {
    cityTouched.current = true;
    setCityState(c);
    writeCity(c);
    writeUserCity(userId, c);
    // Drop an area preset from the city we're leaving. Keep a free-text suburb Ask VibePeep set.
    const nextAreas = new Set(areasForCity(c));
    const previousAreas = new Set(areasForCity(city));
    const keep = (f: FilterState): FilterState => {
      if (!f.suburb || nextAreas.has(f.suburb) || !previousAreas.has(f.suburb)) return f;
      return { ...f, suburb: '' };
    };
    setBoardFilters(keep);
    setMapFilters(keep);
  };
  const pinWindow = (w: TimeWindow) => { setWindowPinned(true); setTimeWindow(w); };

  const filterUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (authStatus === 'loading') return;
    const owner = userId ?? '';
    let previous = '';
    try { previous = sessionStorage.getItem(FILTER_OWNER) ?? ''; } catch {}
    if (previous !== owner) {
      setBoardFilters(EMPTY_FILTERS);
      setMapFilters(EMPTY_FILTERS);
      try {
        sessionStorage.setItem(FILTER_OWNER, owner);
        sessionStorage.removeItem('outza-ui:home:filters');
        sessionStorage.removeItem('outza-ui:map:filters');
        localStorage.removeItem(CAT_KEY);
      } catch {}
    }
    if (userId) {
      try {
        const raw = localStorage.getItem(`${CAT_KEY}:user:${userId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setBoardFilters((f) => withCategories(f, parsed));
        }
      } catch {}
    }
    setCatsHydrated(true);
  }, [authStatus, userId]);

  useEffect(() => {
    if (!catsHydrated || !userId) return;
    if (filterUser.current !== userId) { filterUser.current = userId; return; }
    const list = knownCategories(Array.isArray(boardFilters.categories) ? boardFilters.categories : boardFilters.category ? [boardFilters.category] : []);
    try { localStorage.setItem(`${CAT_KEY}:user:${userId}`, JSON.stringify(list)); } catch {}
  }, [catsHydrated, userId, boardFilters.categories, boardFilters.category]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (cityTouched.current) {
      if (userId) writeUserCity(userId, city);
      return;
    }
    let cancelled = false;
    const url = new URLSearchParams(window.location.search).get('city');
    const signedIn = !!userId;
    const userCity = signedIn ? readUserCity(userId) : null;
    const apply = (homeCity: string | null) => {
      if (cancelled || cityTouched.current) return;
      const next = resolveBoardCity({
        urlCity: url,
        userCity,
        homeCity,
        guestCity: signedIn ? null : readCity(),
        signedIn,
      });
      setCityState(next);
      writeCity(next);
      if (signedIn && userId) writeUserCity(userId, next);
    };
    const urlChosen = url === '' || (!!url && CITIES.some((c) => c.name === url));
    if (!signedIn || userCity !== null || urlChosen) {
      apply(null);
      return () => { cancelled = true; };
    }
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => apply(typeof d?.user?.homeCity === 'string' ? d.user.homeCity : null))
      .catch(() => apply(null));
    return () => { cancelled = true; };
  }, [authStatus, userId]);

  // Live Sydney clock + old ?view=map|saved links forward to their own addresses
  useEffect(() => {
    setNow(sydneyNow());
    const id = setInterval(() => setNow(sydneyNow()), 1000);
    const p = new URLSearchParams(window.location.search);
    const v = p.get('view');
    if (v === 'map' || v === 'saved') router.replace(`/${v}`);
    const patch: Partial<FilterState> = {};
    const category = p.get('category') || '';
    const subTag = p.get('subTag') || p.get('subtag') || '';
    const suburb = p.get('suburb') || '';
    const dateFrom = p.get('dateFrom') || p.get('date') || '';
    const dateTo = p.get('dateTo') || '';
    if (category) { patch.category = category; patch.categories = [category]; }
    if (subTag) patch.subTag = subTag;
    if (suburb) patch.suburb = suburb;
    if (p.get('free') === '1' || p.get('isFree') === 'true') patch.isFree = true;
    if (p.get('lgbtiq') === '1' || p.get('isLGBTI') === 'true') patch.isLGBTI = true;
    if (dateFrom) patch.dateFrom = dateFrom;
    if (dateTo) patch.dateTo = dateTo;
    if (Object.keys(patch).length) setBoardFilters((f) => ({ ...f, ...patch }));
    if (dateFrom) setDay(dateFrom);
    const q = p.get('q') || p.get('search') || '';
    if (q) setSearchInput(q);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`/api/events/stats${city ? `?city=${encodeURIComponent(city)}` : ''}`).
    then((r) => r.json()).
    then((data) => setLastRefresh(data?.lastRefresh ?? null)).
    catch((err) => console.error('Failed to load stats:', err));
  }, [city]);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const today = now?.date ?? null;

  const days = useMemo(() => {
    if (!today) return [];
    const start = filters.dateFrom && filters.dateFrom > today ? filters.dateFrom : today;
    const out: string[] = [];
    let n = DAYS_AHEAD;
    if (day && day > start) {
      const gap = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
      n = Math.max(n, gap + 1);
    }
    for (let i = 0; i < n; i++) {
      const d = addDays(start, i);
      if (filters.dateTo && d > filters.dateTo) break;
      out.push(d);
    }
    return out.length ? out : [start];
  }, [today, filters.dateFrom, filters.dateTo, day]);

  useEffect(() => {
    if (days.length && (!day || !days.includes(day))) setDay(days[0]);
  }, [days, day]);

  const isToday = !!day && day === today;
  const update = (p: Partial<FilterState>) => setFilters((f) => ({ ...f, ...p }));
  const advancedCount = [filters.subTag, filters.suburb, filters.dateFrom || filters.dateTo].filter(Boolean).length;
  const picked = knownCategories(Array.isArray(filters.categories) ? filters.categories : filters.category ? [filters.category] : []);

  const goBoard = (fn: () => void) => () => {
    fn();
    setWindowPinned(true);
    if (view !== 'board') goView('board');
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // Hero AI search → open the same filters on the full board
  const applyAiSearch = (f: AiSearchFilters) => {
    setDay(f.dateFrom);
    setTimeWindow(f.soon ? 'now' : f.timeOfDay === 'evening' ? 'evening' : 'all');
    setSearchInput(f.keywords.join(' '));
    setBoardFilters({
      ...EMPTY_FILTERS,
      categories: f.category ? [f.category] : [],
      category: f.category,
      isFree: f.isFree,
      isLGBTI: f.lgbtiq,
      suburb: f.suburb,
      subTag: f.subTag || '',
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
    });
    if (f.city) setCity(f.city);
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const boardPicked = knownCategories(Array.isArray(boardFilters.categories) ? boardFilters.categories : boardFilters.category ? [boardFilters.category] : []);
  const noType = boardPicked.length === 0
  const quickLinks = [
  { label: 'Today', active: day === today && timeWindow === 'all' && !boardFilters.isFree && !boardFilters.isLGBTI && noType, onClick: goBoard(() => { setDay(today); pinWindow('all'); setBoardFilters(EMPTY_FILTERS); }) },
  { label: 'Tonight', active: day === today && timeWindow === 'evening' && !boardFilters.isFree && !boardFilters.isLGBTI && noType, onClick: goBoard(() => { setDay(today); pinWindow('evening'); setBoardFilters(EMPTY_FILTERS); }) },
  { label: 'This weekend', active: !!day && new Date(`${day}T00:00:00Z`).getUTCDay() === 6 && timeWindow === 'all' && !boardFilters.isFree && !boardFilters.isLGBTI && noType, onClick: goBoard(() => { const sat = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6); if (sat) setDay(sat); pinWindow('all'); setBoardFilters(EMPTY_FILTERS); }) },
  { label: 'Free events', active: boardFilters.isFree, onClick: goBoard(() => setBoardFilters((f) => ({ ...f, isFree: !f.isFree }))) },
  { label: 'LGBTIQ+ events', active: boardFilters.isLGBTI, onClick: goBoard(() => setBoardFilters((f) => ({ ...f, isLGBTI: !f.isLGBTI }))) },
  { label: 'Live music', active: boardPicked.length === 1 && boardPicked[0] === 'Music', onClick: goBoard(() => setBoardFilters((f) => withCategories(f, boardPicked.length === 1 && boardPicked[0] === 'Music' ? [] : ['Music']))) }];


  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      <Navbar savedCount={saved.length} />

      <main className={view === 'map' ? 'relative h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)]' : 'max-w-[1280px] mx-auto px-4 sm:px-6 pt-5'}>
        {view === 'saved' ? (
          <div className="mb-4">
            <h1 className="font-display text-3xl sm:text-[40px] font-bold tracking-tight leading-none">The keepers.</h1>
            <p className="mt-3 text-muted-foreground text-base sm:text-xl leading-snug">All your bookmarks in one tidy line-up. <Link href="/watchlist" className="text-primary underline">My VibePeep</Link> also keeps follows, reminders and a calendar file.</p>
          </div>
        ) : view === 'board' ? (
          <section className="mb-4 rounded-2xl bg-[#0c0f0e] text-white px-4 py-4 sm:px-6 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-brand-gradient" aria-hidden />
                    <span className="text-brand-gradient">Take a peep at what&apos;s happening.</span>
                  </p>
                  <LocalClock city={city} className="text-right" />
                </div>
                <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight">Your city’s calling. Answer it.</h1>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <label className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-primary/40 bg-white/[0.03] px-3 sm:w-[200px]">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="sr-only">Choose a city</span>
                <select value={city} onChange={(e) => setCity(e.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent pr-1 font-medium text-white focus:outline-none" aria-label="Choose a city">
                  <option value="" className="bg-popover text-popover-foreground">All of Australia</option>
                  {CITIES.map((c) => <option key={c.name} value={c.name} className="bg-popover text-popover-foreground">{c.name}, {c.state}</option>)}
                </select>
              </label>
              <AiSearchBar city={city} today={today} onShowAll={applyAiSearch} />
            </div>
          </section>
        ) : null}

        {view === 'board' && <FeaturedTurnstile city={city} />}
        {view === 'board' && today && (
          <HomeRails
            city={city}
            today={today}
            onSeeAll={(kind) => {
              setBoardOpen(true);
              if (kind === 'free') setBoardFilters((f) => ({ ...f, isFree: true }));
              if (kind === 'tonight' && today) { setDay(today); pinWindow('evening'); }
              if (kind === 'weekend') {
                const sat = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6);
                if (sat) setDay(sat);
                pinWindow('all');
              }
              requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            }}
          />
        )}
        {view === 'map' && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[700] flex flex-col gap-2 p-3">
              <div className="pointer-events-auto flex gap-2">
                <label className="inline-flex h-11 w-[46%] max-w-[220px] items-center gap-2 rounded-full border border-border bg-background/95 px-3 shadow-lg backdrop-blur sm:w-[200px]">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-medium focus:outline-none" aria-label="Choose a city">
                    <option value="">All of Australia</option>
                    {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
                <div className="pointer-events-auto relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                  <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search the map" aria-label="Search events" className="h-11 w-full rounded-full border border-border bg-background/95 pl-9 pr-3 text-sm shadow-lg backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <div className="pointer-events-auto flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                <CategoryChip active={!picked.length} onClick={() => setFilters((f) => withCategories(f, []))} label="All" Icon={LayoutGrid} />
                {CATEGORIES.map((c) => (
                  <CategoryChip key={c.name} active={picked.includes(c.name)} onClick={() => setFilters((f) => withCategories(f, picked.includes(c.name) ? picked.filter((n) => n !== c.name) : [...picked, c.name]))} label={c.name} Icon={categoryIcon(c.name)} color={c.color} />
                ))}
                <ToggleChip active={filters.isFree} onClick={() => update({ isFree: !filters.isFree })} label="Free" />
              </div>
            </div>
            <MapView filters={filters} searchQuery={searchQuery} city={city} bleed />
          </>
        )}

        {view !== 'map' && <div ref={boardRef} className="scroll-mt-20 rounded-xl border border-border bg-card overflow-hidden shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)]">
          {view === 'board' &&
          <>
              {/* Big search */}
              <div className="px-3 sm:px-4 pt-4 pb-3 border-b border-border space-y-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
                  <input
                  type="text"
                  role="searchbox"
                  inputMode="search"
                  enterKeyHint="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={`Search ${city ? city : 'Australian'} events — artist, venue, jazz, trivia…`}
                  aria-label="Search events"
                  className="w-full h-14 pl-12 pr-12 rounded-xl border-2 border-border bg-background text-base placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20" />
                
                  {searchInput &&
                <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Clear search">
                      <X className="w-4 h-4" />
                    </button>
                }
                </div>
                {view === 'board' &&
              <div className="flex items-center gap-2">
                    <Popover open={calOpen} onOpenChange={(open) => {
                      setCalOpen(open);
                      if (open) {
                        const iso = boardFilters.dateFrom || day;
                        if (iso) setCalMonth(new Date(`${iso}T12:00:00`));
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <button className="shrink-0 h-11 flex items-center gap-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
                          <CalendarDays className="w-4 h-4" /> Pick a date
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                      mode="single"
                      month={calMonth}
                      onMonthChange={setCalMonth}
                      selected={day ? new Date(`${day}T12:00:00`) : undefined}
                      disabled={today ? { before: new Date(`${today}T00:00:00`) } : undefined}
                      onSelect={(d) => {
                        if (!d) return;
                        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        setDay(iso);
                        setBoardFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' }));
                        setCalOpen(false);
                      }}
                      initialFocus />
                    
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-w-0">
                      {days.slice(0, 14).concat(day && !days.slice(0, 14).includes(day) ? [day] : []).map((d, i) => {
                    const dt = new Date(`${d}T00:00:00Z`);
                    const label = d === today ? 'Today' : i === 1 && days[0] === today ? 'Tomorrow' : dt.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
                    return (
                      <button key={d} onClick={() => { setDay(d); setBoardFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' })); }} className={cn('shrink-0 h-11 min-w-[64px] px-3 rounded-lg border text-center leading-tight transition-colors', day === d ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted')}>
                            <div className="text-xs font-semibold">{label}</div>
                            <div className="text-xs opacity-80">{dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</div>
                          </button>);

                  })}
                    </div>
                  </div>
              }
              </div>
              {/* Time windows (board only) */}
              {view === 'board' &&
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-4 py-2 bg-muted/60 border-b border-border">
                <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
                  {WINDOWS.map((w) => {
                  const disabled = !!w.todayOnly && !isToday;
                  const active = timeWindow === w.key && !disabled;
                  return (
                    <button
                      key={w.key}
                      onClick={() => pinWindow(w.key)}
                      disabled={disabled}
                      title={w.todayOnly && !isToday ? 'Only available for today' : undefined}
                      className={cn(
                        'shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        disabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground'
                      )}>
                      
                        {w.key === 'now' && <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-primary-foreground' : 'bg-primary')} />}
                        {w.label}
                      </button>);

                })}
                </div>
              </div>
              }

              {/* Categories + search + toggles */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-3 sm:px-4 py-3 border-b border-border">
                <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1 lg:flex-1 min-w-0">
                  <CategoryChip active={!picked.length} onClick={() => setFilters((f) => withCategories(f, []))} label="All events" Icon={LayoutGrid} />
                  {CATEGORIES.map((c) =>
                <CategoryChip
                  key={c.name}
                  active={picked.includes(c.name)}
                  onClick={() => setFilters((f) => withCategories(f, picked.includes(c.name) ? picked.filter((n) => n !== c.name) : [...picked, c.name]))}
                  label={c.name}
                  Icon={categoryIcon(c.name)}
                  color={c.color} />

                )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ToggleChip active={filters.isLGBTI} onClick={() => update({ isLGBTI: !filters.isLGBTI })} label="LGBTIQ+" />
                  <ToggleChip active={filters.isFree} onClick={() => update({ isFree: !filters.isFree })} label="Free" />
                  <button
                  onClick={() => setShowFilters(true)}
                  className={cn('h-9 flex items-center gap-2 px-3 rounded-md border text-sm transition-colors', advancedCount ? 'border-primary text-primary' : 'border-border hover:bg-muted')}>
                  
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="hidden sm:inline">Filters</span>
                    {advancedCount > 0 && <span className="font-mono text-[11px]">{advancedCount}</span>}
                  </button>
                </div>
              </div>

              {picked.length === 1 &&
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] px-3 sm:px-4 py-2 border-b border-border">
                  {(CATEGORIES.find((c) => c.name === picked[0])?.subTags ?? []).map((t) =>
              <button
                key={t}
                onClick={() => update({ subTag: filters.subTag === t ? '' : t })}
                className={cn('shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors', filters.subTag === t ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                
                      {t}
                    </button>
              )}
                </div>
            }
            </>
          }

          {view === 'board' &&
          <>
          <div className={cn(!boardOpen && 'max-lg:max-h-[32rem] max-lg:overflow-hidden')}>
          <EventList
            filters={filters}
            searchQuery={searchQuery}
            day={day}
            today={today}
            nowMinutes={now?.minutes ?? 0}
            timeWindow={timeWindow}
            onWindowChange={setTimeWindow}
            windowPinned={windowPinned}
            city={city}
            initialBoard={initialBoard} />
          </div>
          <div className="flex justify-center border-t border-border px-4 py-3 lg:hidden">
            <button type="button" onClick={() => setBoardOpen((open) => !open)} className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              {boardOpen ? 'Show less' : 'See all events'}
            </button>
          </div>
          </>
          }
          {view === 'saved' && <SavedBoard today={today} nowMinutes={now?.minutes ?? 0} onBrowse={() => goView('board')} />}
        </div>}
      </main>

      {/* Filters drawer */}
      {showFilters &&
      <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFilters(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[380px] overflow-auto bg-background border-l border-border p-4">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onClose={() => setShowFilters(false)}
              isMobile
              areas={areasForCity(city)}
              when={view === 'board' && day === today ? timeWindow : ''}
              onWhen={view === 'board' ? (w) => {
                if (!today) return;
                setDay(today);
                setWindowPinned(true);
                setBoardFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' }));
                pinWindow(w);
                setShowFilters(false);
                requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              } : undefined}
            />
          </div>
        </div>
      }

      <Footer lastRefresh={lastRefresh} quickLinks={quickLinks} city={city} />
      <SuggestionButton />
    </div>);

}

function CategoryChip({ active, onClick, label, Icon, color }: {active: boolean;onClick: () => void;label: string;Icon: typeof LayoutGrid;color?: string;}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'shrink-0 flex items-center gap-2 px-3 h-9 rounded-full text-sm transition-colors',
        active ? 'bg-muted text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
      )}>
      
      <Icon className="w-3.5 h-3.5" style={color ? { color } : undefined} />
      {label}
    </button>);

}

function ToggleChip({ active, onClick, label }: {active: boolean;onClick: () => void;label: string;}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 px-3 inline-flex items-center gap-1.5 rounded-md border text-sm font-medium transition-colors',
        active ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'
      )}>
      
      {active && <Check className="w-3.5 h-3.5" aria-hidden />}
      {label}
    </button>);

}