'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Navbar, viewForPath } from '@/components/navbar';
import { FilterPanel, FilterState } from '@/components/filter-panel';
import { EventList, type BoardSeed } from '@/components/event-list';
import { SavedBoard } from '@/components/saved-board';
import { Footer } from '@/components/footer';
import { CATEGORIES, areasForCity, knownCategories, withCategories } from '@/lib/categories';
import { addDays, categoryIcon, listSpan, sydneyNow, type SydneyNow, type TimeWindow } from '@/lib/board';
import { useSaved } from '@/lib/saved';
import { CalendarDays, Check, LayoutGrid, LayoutList, MapPin, Search, SlidersHorizontal, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CITIES, DEFAULT_CITY } from '@/lib/cities';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { HomeRails } from '@/components/home-rails';
import { ViewToggle } from '@/components/view-toggle';
import { SuggestionButton } from '@/components/suggestion-button';
import { LocalClock } from '@/components/local-clock';
import { AiSearchBar, type AiSearchFilters } from '@/components/ai-search-bar';
import { useBackState } from '@/lib/scroll-memory';
import { lineupView } from '@/lib/lineup-view';
import { readCity, readUserCity, resolveBoardCity, writeCity, writeUserCity } from '@/lib/city-pref';
const MapView = dynamic(() => import('@/components/map-view').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Unfolding the map…</div>,
});

const EMPTY_FILTERS: FilterState = {
  category: '', categories: [], subTag: '', suburb: '', isFree: false, isLGBTI: false, dateFrom: '', dateTo: '', datePreset: ''
};
const CAT_KEY = 'se-categories-v1';
const FILTER_OWNER = 'outza-filter-owner';
const DAYS_AHEAD = 30;

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
  // List and map share one filter set, one search and one date, so toggling views does not start again.
  const [filters, setFilters] = useBackState<FilterState>('home:filters', EMPTY_FILTERS);
  const [resultsView, setResultsViewState] = useState<'list' | 'board'>('list');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [askRequest, setAskRequest] = useState<{ id: number; text: string } | null>(null);
  const [heroPhoto, setHeroPhoto] = useState<string | null>(null);
  const askSeq = useRef(0);
  const [now, setNow] = useState<SydneyNow | null>(initialNow);
  const [day, setDay] = useBackState<string | null>('home:day', initialNow.date);
  // Land on what's on now. Full day stays on the Today chip, and ended rows stay hidden until "Show ended".
  const [timeWindow, setTimeWindow] = useBackState<TimeWindow>('home:window-v2', 'now');
  const [windowPinned, setWindowPinned] = useState(false);
  const [city, setCityState] = useState<string>(DEFAULT_CITY);
  const [catsHydrated, setCatsHydrated] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [railIds, setRailIds] = useState<string[]>([]);
  const [browseCount, setBrowseCount] = useState(0);
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
    setFilters(keep);
  };
  const pinWindow = (w: TimeWindow) => { setWindowPinned(true); setTimeWindow(w); };

  const filterUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (authStatus === 'loading') return;
    const owner = userId ?? '';
    let previous = '';
    try { previous = sessionStorage.getItem(FILTER_OWNER) ?? ''; } catch {}
    if (previous !== owner) {
      setFilters(EMPTY_FILTERS);
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
          if (Array.isArray(parsed)) setFilters((f) => withCategories(f, parsed));
        }
      } catch {}
    }
    setCatsHydrated(true);
  }, [authStatus, userId]);

  useEffect(() => {
    if (!catsHydrated || !userId) return;
    if (filterUser.current !== userId) { filterUser.current = userId; return; }
    const list = knownCategories(Array.isArray(filters.categories) ? filters.categories : filters.category ? [filters.category] : []);
    try { localStorage.setItem(`${CAT_KEY}:user:${userId}`, JSON.stringify(list)); } catch {}
  }, [catsHydrated, userId, filters.categories, filters.category]);

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
    if (Object.keys(patch).length) setFilters((f) => ({ ...f, ...patch }));
    try {
      const remembered = sessionStorage.getItem('vp-results-view');
      if (lineupView(remembered) === 'board') setResultsViewState('board');
    } catch {}
    if (dateFrom) setDay(dateFrom);
    const q = p.get('q') || p.get('search') || '';
    if (q) setSearchInput(q);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`/api/featured${city ? `?city=${encodeURIComponent(city)}` : ''}`)
      .then((r) => r.json())
      .then((data) => {
        const photo = (data?.items ?? []).find((item: { imageUrl?: string | null }) => item.imageUrl && /^https?:\/\//i.test(item.imageUrl) && !/picsum\.photos/i.test(item.imageUrl))?.imageUrl ?? null;
        if (live) setHeroPhoto(photo);
      })
      .catch(() => { if (live) setHeroPhoto(null); });
    return () => { live = false; };
  }, [city]);

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

  const update = (p: Partial<FilterState>) => setFilters((f) => ({ ...f, ...p }));
  const advancedCount = [filters.subTag, filters.suburb, filters.dateFrom || filters.dateTo].filter(Boolean).length;
  const picked = knownCategories(Array.isArray(filters.categories) ? filters.categories : filters.category ? [filters.category] : []);

  const rememberView = (next: 'list' | 'map') => {
    if (next !== 'list') return;
    setResultsViewState('list');
    try { sessionStorage.setItem('vp-results-view', 'list'); } catch {}
    if (view === 'map') goView('board');
  };
  const rememberLineup = (next: 'list' | 'board') => {
    setResultsViewState(next);
    try { sessionStorage.setItem('vp-results-view', next); } catch {}
  };
  const goBoard = (fn: () => void) => () => {
    fn();
    setWindowPinned(true);
    rememberView('list');
    if (view !== 'board') goView('board');
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const ask = (text: string) => {
    askSeq.current += 1;
    setAskRequest({ id: askSeq.current, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const nextWeek = today ? (() => {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const untilMonday = dow === 0 ? 1 : 8 - dow;
    const monday = addDays(today, untilMonday);
    return { from: monday, to: addDays(monday, 6) };
  })() : null;
  const applyPlan = (key: 'today' | 'tonight' | 'tomorrow' | 'weekend' | 'next') => {
    if (!today) return;
    setWindowPinned(true);
    if (key === 'today') { setDay(today); setTimeWindow('all'); setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' })); }
    if (key === 'tonight') { setDay(today); setTimeWindow('evening'); setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' })); }
    if (key === 'tomorrow') { setDay(addDays(today, 1)); setTimeWindow('all'); setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' })); }
    if (key === 'weekend') {
      const sat = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6);
      if (sat) setDay(sat);
      setTimeWindow('all');
      setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' }));
    }
    if (key === 'next' && nextWeek) {
      setDay(nextWeek.from);
      setTimeWindow('all');
      setFilters((f) => ({ ...f, dateFrom: nextWeek.from, dateTo: nextWeek.to, datePreset: '' }));
    }
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // Hero AI search → open the same filters on the full board
  const applyAiSearch = (f: AiSearchFilters) => {
    setDay(f.dateFrom);
    setTimeWindow(f.soon ? 'now' : f.timeOfDay === 'evening' ? 'evening' : 'all');
    setSearchInput(f.keywords.join(' '));
    setFilters({
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
  const span = listSpan(day, filters.dateFrom, filters.dateTo);
  const mapFilters: FilterState = span ? { ...filters, dateFrom: span.from, dateTo: span.to } : filters;
  const planKey = filters.dateFrom && nextWeek && filters.dateFrom === nextWeek.from && filters.dateTo === nextWeek.to
    ? 'next'
    : day === today && timeWindow === 'evening' && !filters.dateFrom
      ? 'tonight'
      : day === today && timeWindow === 'all' && !filters.dateFrom
        ? 'today'
        : today && day === addDays(today, 1) && timeWindow === 'all' && !filters.dateFrom
          ? 'tomorrow'
          : !!day && new Date(`${day}T00:00:00Z`).getUTCDay() === 6 && timeWindow === 'all' && !filters.dateFrom
            ? 'weekend'
            : '';
  const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekendSat = today ? days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6) : null;
  const planChips: { key: 'today' | 'tonight' | 'tomorrow' | 'weekend' | 'next'; label: string; detail: string }[] = today ? [
    { key: 'today', label: 'Today', detail: shortDate(today) },
    { key: 'tonight', label: 'Tonight', detail: 'From 5pm' },
    { key: 'tomorrow', label: 'Tomorrow', detail: shortDate(addDays(today, 1)) },
    { key: 'weekend', label: 'This weekend', detail: weekendSat ? `${shortDate(weekendSat)} – ${shortDate(addDays(weekendSat, 1))}` : 'Sat – Sun' },
    { key: 'next', label: 'Next week', detail: nextWeek ? `${shortDate(nextWeek.from)} – ${shortDate(nextWeek.to)}` : 'Next week' },
  ] : [];
  const boardPicked = knownCategories(Array.isArray(filters.categories) ? filters.categories : filters.category ? [filters.category] : []);
  const noType = boardPicked.length === 0
  const quickLinks = [
  { label: 'Today', active: day === today && timeWindow === 'all' && !filters.isFree && !filters.isLGBTI && noType, onClick: goBoard(() => { setDay(today); pinWindow('all'); setFilters(EMPTY_FILTERS); }) },
  { label: 'Tonight', active: day === today && timeWindow === 'evening' && !filters.isFree && !filters.isLGBTI && noType, onClick: goBoard(() => { setDay(today); pinWindow('evening'); setFilters(EMPTY_FILTERS); }) },
  { label: 'This weekend', active: !!day && new Date(`${day}T00:00:00Z`).getUTCDay() === 6 && timeWindow === 'all' && !filters.isFree && !filters.isLGBTI && noType, onClick: goBoard(() => { const sat = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6); if (sat) setDay(sat); pinWindow('all'); setFilters(EMPTY_FILTERS); }) },
  { label: 'Free events', active: filters.isFree, onClick: goBoard(() => setFilters((f) => ({ ...f, isFree: !f.isFree }))) },
  { label: 'LGBTIQ+ events', active: filters.isLGBTI, onClick: goBoard(() => setFilters((f) => ({ ...f, isLGBTI: !f.isLGBTI }))) },
  { label: 'Live music', active: boardPicked.length === 1 && boardPicked[0] === 'Music', onClick: goBoard(() => setFilters((f) => withCategories(f, boardPicked.length === 1 && boardPicked[0] === 'Music' ? [] : ['Music']))) }];


  return (
    <div className={view === 'map' ? 'vp-map-screen min-h-screen bg-background text-foreground overflow-x-clip' : 'min-h-screen bg-background text-foreground overflow-x-clip'}>
      <Navbar savedCount={saved.length} />

      <main className={view === 'map' ? 'vp-map-main relative flex h-[calc(100dvh-3.5rem-var(--vp-bottom-nav-offset))] min-h-0 flex-col sm:h-[calc(100dvh-4rem-var(--vp-bottom-nav-offset))]' : 'vp-wrap px-4 sm:px-6 pt-5'}>
        {view === 'board' ? (
          <section className="vp-peep-hero relative mb-6 overflow-hidden rounded-3xl bg-[#0c0f0e] px-4 py-6 text-white shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)] sm:px-8 sm:py-8">
            {heroPhoto && <img src={heroPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/45" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-[2rem] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="block">Your city’s calling.</span>
                  <span className="block text-brand-gradient">Answer it.</span>
                </h1>
                <p className="mt-3 max-w-xl text-sm text-white/80 sm:text-lg">Good gigs. Hidden gems. Things you didn’t know were happening. Go on, have a peep.</p>
              </div>
              <LocalClock city={city} className="vp-hero-clock shrink-0 text-right" />
            </div>
            <div className="relative mt-5 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
              <label className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <span className="sr-only">Choose a city</span>
                <select value={city} onChange={(e) => setCity(e.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent font-medium text-white focus:outline-none" aria-label="Choose a city">
                  <option value="" className="bg-popover text-popover-foreground">All of Australia</option>
                  {CITIES.map((c) => <option key={c.name} value={c.name} className="bg-popover text-popover-foreground">{c.name}, {c.state}</option>)}
                </select>
              </label>
              <AiSearchBar city={city} today={today} onShowAll={applyAiSearch} placeholder="Ask for a vibe…" queryRequest={askRequest} chips={false} />
            </div>
            <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { label: 'Tonight', run: () => applyPlan('tonight') },
                { label: 'This weekend', run: () => applyPlan('weekend') },
                { label: 'Next week', run: () => applyPlan('next') },
                { label: 'Free', run: () => { update({ isFree: true }); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
                { label: 'Live music', run: () => { setFilters((f) => withCategories(f, ['Music'])); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
                { label: 'Date night', run: () => ask('Date night') },
                { label: 'Family', run: () => { setFilters((f) => withCategories(f, ['Family'])); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
                { label: 'Near me', run: () => document.getElementById('neighbourhoods')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
              ].map((chip) => (
                <button key={chip.label} type="button" onClick={chip.run} className="h-10 shrink-0 rounded-full bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20">{chip.label}</button>
              ))}
            </div>
          </section>
        ) : null}

        {view === 'board' && (
          <HomeRails
            city={city}
            today={today}
            onSeeAll={(kind) => applyPlan(kind)}
            onShown={setRailIds}
            onSuburb={(suburb) => { setFilters((f) => ({ ...f, suburb })); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}
          />
        )}
        {view === 'map' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="vp-map-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
              <ViewToggle value="map" onChange={rememberView} />
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {planChips.map((chip) => (
                  <button key={chip.key} type="button" aria-pressed={planKey === chip.key} onClick={() => applyPlan(chip.key)} className={cn('h-10 shrink-0 rounded-full px-3 text-sm font-semibold', planKey === chip.key ? 'bg-foreground text-background' : 'bg-muted')}>{chip.label}</button>
                ))}
              </div>
              <button type="button" onClick={() => setShowFilters(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </button>
            </div>
            <div className="vp-map-toolbar flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4 lg:gap-0 lg:px-0">
              <div className="w-[46%] max-w-[220px] shrink-0 lg:w-80 lg:max-w-none lg:px-4">
                <label className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-background px-3 shadow-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="sr-only">Choose a city</span>
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium focus:outline-none" aria-label="Choose a city">
                    <option value="">All of Australia</option>
                    {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="min-w-0 flex-1 lg:px-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                  <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search the map" aria-label="Search events" className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0">
              <MapView
                filters={mapFilters}
                searchQuery={searchQuery}
                city={city}
                bleed
                focusId={focusId}
                onSelect={setFocusId}
                chips={(
                  <>
                    <CategoryChip active={!picked.length} onClick={() => setFilters((f) => withCategories(f, []))} label="All" Icon={LayoutGrid} />
                    {CATEGORIES.map((c) => (
                      <CategoryChip key={c.name} active={picked.includes(c.name)} onClick={() => setFilters((f) => withCategories(f, picked.includes(c.name) ? picked.filter((n) => n !== c.name) : [...picked, c.name]))} label={c.name} Icon={categoryIcon(c.name)} color={c.color} />
                    ))}
                    <CategoryChip active={filters.isFree} onClick={() => update({ isFree: !filters.isFree })} label="Free" Icon={Ticket} />
                  </>
                )}
              />
              </div>
            </div>
          </div>
        )}

        {view === 'saved' && <SavedBoard today={today} nowMinutes={now?.minutes ?? 0} onBrowse={() => goView('board')} />}
        {view === 'board' && <div ref={boardRef} id="line-up" className="mb-10 scroll-mt-28 rounded-xl border border-border bg-card overflow-hidden shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)]">
          {view === 'board' && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <h2 className="min-w-0 font-display text-lg font-bold leading-tight sm:text-xl">Browse everything</h2>
              <ViewToggle compact value={resultsView} label="Line-up view" options={[{ key: 'list', text: 'List', Icon: LayoutList }, { key: 'board', text: 'Board', Icon: LayoutGrid }]} onChange={rememberLineup} />
            </div>
          )}
          {view === 'board' &&
          <>
              <div className="border-b border-border px-3 pb-3 pt-4 sm:px-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                  <input
                    type="text"
                    role="searchbox"
                    inputMode="search"
                    enterKeyHint="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={`Search ${city ? city : 'Australian'} gigs, venues, suburbs — jazz, trivia, whatever…`}
                    aria-label="Search events"
                    className="h-12 w-full rounded-xl border-2 border-border bg-background pl-12 pr-12 text-base placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 sm:h-14"
                  />
                  {searchInput && (
                    <button type="button" onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-3 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
                <button type="button" aria-pressed={planKey === 'today'} onClick={() => applyPlan('today')} className={cn('h-9 shrink-0 rounded-full px-3 text-sm font-medium', planKey === 'today' ? 'bg-foreground text-background' : 'bg-muted')}>Today</button>
                <button type="button" aria-pressed={planKey === 'tonight'} onClick={() => applyPlan('tonight')} className={cn('h-9 shrink-0 rounded-full px-3 text-sm font-medium', planKey === 'tonight' ? 'bg-foreground text-background' : 'bg-muted')}>Tonight</button>
                <button type="button" aria-pressed={planKey === 'weekend'} onClick={() => applyPlan('weekend')} className={cn('h-9 shrink-0 rounded-full px-3 text-sm font-medium', planKey === 'weekend' ? 'bg-foreground text-background' : 'bg-muted')}>This weekend</button>
                <Popover open={calOpen} onOpenChange={(open) => {
                  setCalOpen(open);
                  if (open) {
                    const iso = filters.dateFrom || day;
                    if (iso) setCalMonth(new Date(`${iso}T12:00:00`));
                  }
                }}>
                  <PopoverTrigger asChild>
                    <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium">
                      <CalendarDays className="h-4 w-4" /> Pick a date
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
                        pinWindow('all');
                        setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' }));
                        setCalOpen(false);
                      }}
                      initialFocus />
                  </PopoverContent>
                </Popover>
                <CategoryChip active={!picked.length} onClick={() => setFilters((f) => withCategories(f, []))} label="All" Icon={LayoutGrid} />
                {CATEGORIES.map((c) => (
                  <CategoryChip key={c.name} active={picked.includes(c.name)} onClick={() => setFilters((f) => withCategories(f, picked.includes(c.name) ? picked.filter((n) => n !== c.name) : [...picked, c.name]))} label={c.name} Icon={categoryIcon(c.name)} color={c.color} />
                ))}
                <ToggleChip active={filters.isFree} onClick={() => update({ isFree: !filters.isFree })} label="Free" />
                <button type="button" onClick={() => setShowFilters(true)} aria-label="Filters" className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm', advancedCount ? 'border-primary text-primary' : 'border-border')}>
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                  {advancedCount > 0 && <span className="font-mono text-[11px]">{advancedCount}</span>}
                </button>
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
          <EventList
            layout={resultsView}
            filters={filters}
            searchQuery={searchQuery}
            day={day}
            today={today}
            nowMinutes={now?.minutes ?? 0}
            timeWindow={timeWindow}
            onWindowChange={setTimeWindow}
            windowPinned={windowPinned}
            city={city}
            initialBoard={initialBoard}
            activeId={focusId}
            excludeIds={boardOpen || searchQuery ? [] : railIds}
            previewLimit={boardOpen ? undefined : 8}
            onListedCount={setBrowseCount} />
          <div className="flex justify-center border-t border-border px-4 py-3">
            <button type="button" onClick={() => setBoardOpen((open) => !open)} className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              {boardOpen ? 'Show the short list' : `See all ${browseCount} events`}
            </button>
          </div>
          </>
          }
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
              when={day === today ? timeWindow : ''}
              onWhen={(w) => {
                if (!today) return;
                setDay(today);
                setWindowPinned(true);
                setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' }));
                pinWindow(w);
                setShowFilters(false);
                requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
            />
          </div>
        </div>
      }

      {view !== 'map' && <Footer lastRefresh={lastRefresh} quickLinks={view === 'board' ? [] : quickLinks} city={city} />}
      {view !== 'map' && <SuggestionButton />}
    </div>);

}

function CategoryChip({ active, onClick, label, Icon, color }: {active: boolean;onClick: () => void;label: string;Icon?: typeof LayoutGrid;color?: string;}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors',
        active ? 'bg-muted text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
      )}>
      
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" style={color ? { color } : undefined} /> : null}
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