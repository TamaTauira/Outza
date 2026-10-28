'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Navbar, viewForPath } from '@/components/navbar';
import { FilterPanel, FilterState } from '@/components/filter-panel';
import { EventList } from '@/components/event-list';
import { SavedBoard } from '@/components/saved-board';
import { MapView } from '@/components/map-view';
import { Footer } from '@/components/footer';
import { CATEGORIES, knownCategories, withCategories } from '@/lib/categories';
import { addDays, categoryIcon, sydneyNow, type SydneyNow, type TimeWindow } from '@/lib/board';
import { useSaved } from '@/lib/saved';
import { ArrowRight, CalendarDays, Check, Info, LayoutGrid, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CITIES, DEFAULT_CITY } from '@/lib/cities';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { FeaturedTurnstile } from '@/components/featured-turnstile';
import { SuggestionButton } from '@/components/suggestion-button';
import { LocalClock } from '@/components/local-clock';
import { AiSearchBar, type AiSearchFilters } from '@/components/ai-search-bar';
import { useBackState } from '@/lib/scroll-memory';
import { readCity, writeCity } from '@/lib/city-pref';

const EMPTY_FILTERS: FilterState = {
  category: '', categories: [], subTag: '', suburb: '', isFree: false, isLGBTI: false, dateFrom: '', dateTo: '', datePreset: ''
};
const CAT_KEY = 'se-categories-v1';
const DAYS_AHEAD = 30;

const WINDOWS: {key: TimeWindow;label: string;todayOnly?: boolean;}[] = [
{ key: 'now', label: 'Now & next', todayOnly: true },
{ key: 'hour', label: 'Next 60 min', todayOnly: true },
{ key: 'evening', label: 'Evening' },
{ key: 'all', label: 'Full day' }];


export function HomeClient() {
  // Board, Map and Saved are real addresses (/, /map, /saved) sharing this one component via the
  // (board) layout, so filters survive switching views and Back/bookmarks/sharing all work.
  const router = useRouter();
  const view = viewForPath(usePathname()) ?? 'board';
  const goView = (v: 'board' | 'map' | 'saved') => router.push(v === 'board' ? '/' : `/${v}`);
  // Board choices are remembered so Back from an event returns to the same board and scroll spot.
  const [searchInput, setSearchInput] = useBackState('home:search', '');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [filters, setFilters] = useBackState<FilterState>('home:filters', EMPTY_FILTERS);
  const [now, setNow] = useState<SydneyNow | null>(null);
  const [day, setDay] = useBackState<string | null>('home:day', null);
  // Opens on what's on now and next, not on the earlier, already-ended part of the day.
  const [timeWindow, setTimeWindow] = useBackState<TimeWindow>('home:window', 'now');
  const [windowPinned, setWindowPinned] = useState(false);
  const [city, setCityState] = useState<string>(DEFAULT_CITY);
  const [catsHydrated, setCatsHydrated] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const { saved } = useSaved();
  const boardRef = useRef<HTMLDivElement>(null);
  const setCity = (c: string) => { setCityState(c); writeCity(c); };
  const pinWindow = (w: TimeWindow) => { setWindowPinned(true); setTimeWindow(w); };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFilters((f) => withCategories(f, parsed));
      }
    } catch {}
    setCatsHydrated(true);
  }, []);

  useEffect(() => {
    if (!catsHydrated) return;
    const list = knownCategories(Array.isArray(filters.categories) ? filters.categories : filters.category ? [filters.category] : []);
    try { localStorage.setItem(CAT_KEY, JSON.stringify(list)); } catch {}
  }, [catsHydrated, filters.categories, filters.category]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('city');
      if (q && CITIES.some((x) => x.name === q)) { setCity(q); return; }
      const c = readCity();
      if (c !== null) setCityState(c);
    } catch {}
  }, []);

  // Live Sydney clock + old ?view=map|saved links forward to their own addresses
  useEffect(() => {
    setNow(sydneyNow());
    const id = setInterval(() => setNow(sydneyNow()), 1000);
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'map' || v === 'saved') router.replace(`/${v}`);
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
    setFilters({
      ...EMPTY_FILTERS,
      categories: f.category ? [f.category] : [],
      category: f.category,
      isFree: f.isFree,
      isLGBTI: f.lgbtiq,
      suburb: f.suburb,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
    });
    if (f.city) setCity(f.city);
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const noType = picked.length === 0
  const quickLinks = [
  { label: 'Today', active: day === today && timeWindow === 'all' && !filters.isFree && !filters.isLGBTI && noType, onClick: goBoard(() => { setDay(today); pinWindow('all'); setFilters(EMPTY_FILTERS); }) },
  { label: 'Tonight', active: day === today && timeWindow === 'evening' && !filters.isFree && !filters.isLGBTI && noType, onClick: goBoard(() => { setDay(today); pinWindow('evening'); setFilters(EMPTY_FILTERS); }) },
  { label: 'This weekend', active: !!day && new Date(`${day}T00:00:00Z`).getUTCDay() === 6 && timeWindow === 'all' && !filters.isFree && !filters.isLGBTI && noType, onClick: goBoard(() => { const sat = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6); if (sat) setDay(sat); pinWindow('all'); setFilters(EMPTY_FILTERS); }) },
  { label: 'Free events', active: filters.isFree, onClick: goBoard(() => update({ isFree: !filters.isFree })) },
  { label: 'LGBTIQ+ events', active: filters.isLGBTI, onClick: goBoard(() => update({ isLGBTI: !filters.isLGBTI })) },
  { label: 'Live music', active: picked.length === 1 && picked[0] === 'Music', onClick: goBoard(() => setFilters((f) => withCategories(f, picked.length === 1 && picked[0] === 'Music' ? [] : ['Music']))) }];


  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      <Navbar savedCount={saved.length} />

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-5">
        {view === 'saved' ? (
          <div className="mb-4">
            <h1 className="font-display text-3xl sm:text-[40px] font-bold tracking-tight leading-none">The keepers.</h1>
            <p className="mt-3 text-muted-foreground text-base sm:text-xl leading-snug">All your bookmarks in one tidy line-up.</p>
          </div>
        ) : view === 'map' ? (
          <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl sm:text-[40px] font-bold tracking-tight leading-none">Map it out.</h1>
              <p className="mt-3 text-muted-foreground text-base sm:text-xl leading-snug">Every pin's a plan waiting to happen.</p>
            </div>
            <label className="inline-flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 h-12 sm:w-[230px] shrink-0">
              <MapPin className="w-5 h-5 text-primary shrink-0" />
              <span className="sr-only">Choose a city</span>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="flex-1 min-w-0 bg-transparent font-medium text-base pr-1 focus:outline-none cursor-pointer" aria-label="Choose a city">
                <option value="" className="bg-popover text-popover-foreground">All of Australia</option>
                {CITIES.map((c) => <option key={c.name} value={c.name} className="bg-popover text-popover-foreground">{c.name}, {c.state}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <section className="mb-5 rounded-2xl bg-[#0c0f0e] text-white px-5 py-6 sm:px-8 sm:py-7 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold uppercase tracking-wide text-primary">
                <span className="w-2.5 h-2.5 rounded-full bg-primary" aria-hidden />
                Discover more with Outza
              </p>
              <LocalClock className="text-right" />
            </div>
            <h1 className="mt-3 font-display text-3xl sm:text-[40px] font-bold tracking-tight leading-tight">Your city’s calling. Answer it.</h1>
            <p className="mt-3 text-base sm:text-xl text-white/80 leading-snug">Gigs, pop-ups, markets and hidden gems, all happening near you and all in one spot.</p>
            <div className="mt-5 flex flex-col sm:flex-row sm:items-start gap-3">
              <label className="inline-flex items-center gap-2.5 rounded-xl border border-primary/40 bg-white/[0.03] px-4 h-14 sm:w-[230px] shrink-0">
                <MapPin className="w-5 h-5 text-primary shrink-0" />
                <span className="sr-only">Choose a city</span>
                <select value={city} onChange={(e) => setCity(e.target.value)} className="flex-1 min-w-0 bg-transparent text-white font-medium text-base sm:text-lg pr-1 focus:outline-none cursor-pointer" aria-label="Choose a city">
                  <option value="" className="bg-popover text-popover-foreground">All of Australia</option>
                  {CITIES.map((c) => <option key={c.name} value={c.name} className="bg-popover text-popover-foreground">{c.name}, {c.state}</option>)}
                </select>
              </label>
              <AiSearchBar city={city} today={today} onShowAll={applyAiSearch} />
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs sm:text-sm text-white/70">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              Event details may change. Confirm times, availability and prices with the organiser before attending.
            </p>
          </section>
        )}

        {view !== 'saved' && <FeaturedTurnstile city={city} />}

        <div ref={boardRef} className="scroll-mt-20 rounded-xl border border-border bg-card overflow-hidden shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)]">
          {view !== 'saved' &&
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
                    <Popover open={calOpen} onOpenChange={setCalOpen}>
                      <PopoverTrigger asChild>
                        <button className="shrink-0 h-11 flex items-center gap-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
                          <CalendarDays className="w-4 h-4" /> Pick a date
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                      mode="single"
                      selected={day ? new Date(`${day}T12:00:00`) : undefined}
                      disabled={today ? { before: new Date(`${today}T00:00:00`) } : undefined}
                      onSelect={(d) => {
                        if (!d) return;
                        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        setDay(iso);setCalOpen(false);
                      }}
                      initialFocus />
                    
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-w-0">
                      {days.slice(0, 14).concat(day && !days.slice(0, 14).includes(day) ? [day] : []).map((d, i) => {
                    const dt = new Date(`${d}T00:00:00Z`);
                    const label = d === today ? 'Today' : i === 1 && days[0] === today ? 'Tomorrow' : dt.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
                    return (
                      <button key={d} onClick={() => setDay(d)} className={cn('shrink-0 h-11 min-w-[64px] px-3 rounded-lg border text-center leading-tight transition-colors', day === d ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted')}>
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
          <EventList
            filters={filters}
            searchQuery={searchQuery}
            day={day}
            today={today}
            nowMinutes={now?.minutes ?? 0}
            timeWindow={timeWindow}
            onWindowChange={setTimeWindow}
            windowPinned={windowPinned}
            city={city} />

          }
          {view === 'map' && <div className="p-3"><MapView filters={filters} searchQuery={searchQuery} city={city} /></div>}
          {view === 'saved' && <SavedBoard today={today} nowMinutes={now?.minutes ?? 0} onBrowse={() => goView('board')} />}
        </div>
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
              when={day === today ? (timeWindow === 'evening' ? 'tonight' : timeWindow === 'now' || timeWindow === 'hour' ? 'soon' : timeWindow === 'all' ? 'today' : '') : ''}
              onWhen={(w) => {
                if (!today) return;
                setDay(today);
                setWindowPinned(true);
                setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', datePreset: '' }));
                pinWindow(w === 'tonight' ? 'evening' : w === 'soon' ? 'now' : 'all');
                setShowFilters(false);
                requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
            />
          </div>
        </div>
      }

      <Footer lastRefresh={lastRefresh} quickLinks={quickLinks} />
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