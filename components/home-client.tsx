'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Navbar, viewForPath } from '@/components/navbar';
import { FilterPanel, FilterState } from '@/components/filter-panel';
import { EventList, type BoardSeed } from '@/components/event-list';
import { SavedBoard } from '@/components/saved-board';
import { CATEGORIES, areaGroupLabels, filterAreasForCity, knownCategories, withCategories } from '@/lib/categories';
import { addDays, categoryIcon, listSpan, sydneyNow, type SydneyNow, type TimeWindow } from '@/lib/board';
import { useSaved } from '@/lib/saved';
import { CalendarDays, Check, LayoutGrid, LayoutList, MapPin, SlidersHorizontal, Ticket } from 'lucide-react';
import { SearchField } from '@/components/ui/search-field';
import { Chip } from '@/components/ui/chip';
import { FilterBar, filterChipClass } from '@/components/filter-bar';
import { cn } from '@/lib/utils';
import { CITIES, cityDef, DEFAULT_CITY } from '@/lib/cities';
import { CityPicker } from '@/components/city-picker';
import { weekendRange } from '@/lib/seo';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { HomeRails } from '@/components/home-rails';
import { PageScrollLock } from '@/components/page-scroll-lock';
import { ViewToggle } from '@/components/view-toggle';
import { SuggestionButton } from '@/components/suggestion-button';
import { AiSearchBar, type AiSearchFilters } from '@/components/ai-search-bar';
import { HeroCard, cityHeroSrc } from '@/components/hero-card';
import { FeaturedTurnstile } from '@/components/featured-turnstile';
import { COPY } from '@/lib/copy';
import { displayTitle } from '@/lib/display-public';
import { useBackState } from '@/lib/scroll-memory';
import { lineupView } from '@/lib/lineup-view';
import { readCity, readUserCity, resolveBoardCity, writeCity, writeUserCity } from '@/lib/city-pref';
import { armReconnect, createReconnectRetry, readJson } from '@/lib/client-fetch';
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
  useEffect(() => {
    if (!showFilters) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowFilters(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFilters]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  // List and map share one filter set, one search and one date, so toggling views does not start again.
  const [filters, setFilters] = useBackState<FilterState>('home:filters', EMPTY_FILTERS);
  const [resultsView, setResultsViewState] = useState<'list' | 'board'>('list');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [askRequest, setAskRequest] = useState<{ id: number; text: string } | null>(null);
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
  const [searchHints, setSearchHints] = useState<string[]>([]);
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
    const nextAreas = new Set(filterAreasForCity(c));
    const previousAreas = new Set(filterAreasForCity(city));
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
    // The edge (IP) default only ever fills gaps. It is consulted solely when
    // nothing is stored, and its area only fills an empty area slot, so a
    // suburb or area the person (or a link) already chose always wins. Once
    // applied, the city is written back through the same keys a manual pick
    // uses, so the default persists like a pick and never fights the person
    // on the next page; a later manual change overwrites it the same way.
    const applyEdgeArea = (area: unknown) => {
      if (typeof area !== 'string' || !area) return;
      setFilters((f) => (f.suburb ? f : { ...f, suburb: area }));
    };
    const urlChosen = url === '' || (!!url && CITIES.some((c) => c.name === url));
    const guestBefore = readCity();
    if (!signedIn || userCity !== null || urlChosen) {
      apply(null);
      if (!signedIn && guestBefore === null && !url) {
        fetch('/api/edge-city').then((r) => r.json()).then((d) => {
          if (cancelled || cityTouched.current || typeof d?.city !== 'string' || !d.city) return
          setCityState(d.city)
          writeCity(d.city)
          applyEdgeArea(d?.area)
        }).catch(() => {})
      }
      return () => { cancelled = true; };
    }
    const retry = createReconnectRetry();
    const loadHome = () => {
      readJson<{ user?: { homeCity?: unknown } }>('/api/me').then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          if (result.reason === 'network') armReconnect(retry, () => { if (!cancelled) loadHome(); });
          else apply(null);
          return;
        }
        const home = result.data?.user?.homeCity;
        if (typeof home === 'string') { apply(home); return; }
        // Signed in, but nothing stored anywhere: no device pick (this branch
        // only runs when there is none) and no account home city. Fall back
        // to the edge (IP) default before the plain Sydney default, like the
        // guest path. A ?city= link of any kind still wins outright.
        if (url) { apply(null); return; }
        fetch('/api/edge-city').then((r) => r.json()).then((d) => {
          if (cancelled || cityTouched.current) return;
          if (typeof d?.city === 'string' && d.city) {
            apply(d.city);
            applyEdgeArea(d?.area);
          } else {
            apply(null);
          }
        }).catch(() => { if (!cancelled) apply(null); });
      });
    };
    loadHome();
    return () => { cancelled = true; retry.stop(); };
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
    const retry = createReconnectRetry();
    const load = () => {
      readJson<{ lastRefresh?: string | null }>(`/api/events/stats${city ? `?city=${encodeURIComponent(city)}` : ''}`).then((result) => {
        if (!live) return;
        if (!result.ok) {
          if (result.reason === 'network') armReconnect(retry, () => { if (live) load(); });
          return;
        }
        setLastRefresh(result.data?.lastRefresh ?? null);
      });
    };
    load();
    return () => { live = false; retry.stop(); };
  }, [city]);

  useEffect(() => {
    const place = city || DEFAULT_CITY
    document.title = `What’s on in ${place}: events, gigs and things to do | VibePeep`
  }, [city]);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const q = searchInput.trim()
    if (q.length < 2) { setSearchHints([]); return }
    const t = setTimeout(() => {
      const params = new URLSearchParams({ search: q, limit: '6' })
      if (city) params.set('city', city)
      fetch(`/api/events?${params}`).then((r) => r.json()).then((data) => {
        const titles = Array.isArray(data?.events) ? data.events.map((event: { title?: string }) => displayTitle(event.title ?? '')).filter(Boolean) : []
        setSearchHints([...new Set<string>(titles)].slice(0, 6))
      }).catch(() => setSearchHints([]))
    }, 250)
    return () => clearTimeout(t)
  }, [searchInput, city]);

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
      const range = weekendRange(cityDef(city || DEFAULT_CITY));
      setDay(range.from);
      setTimeWindow('all');
      setFilters((f) => ({ ...f, dateFrom: range.from, dateTo: range.to, datePreset: '' }));
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
  const weekend = today ? weekendRange(cityDef(city || DEFAULT_CITY)) : null;
  const planKey = filters.dateFrom && nextWeek && filters.dateFrom === nextWeek.from && filters.dateTo === nextWeek.to
    ? 'next'
    : day === today && timeWindow === 'evening' && !filters.dateFrom
      ? 'tonight'
      : day === today && timeWindow === 'all' && !filters.dateFrom
        ? 'today'
        : today && day === addDays(today, 1) && timeWindow === 'all' && !filters.dateFrom
          ? 'tomorrow'
          : weekend && filters.dateFrom === weekend.from && filters.dateTo === weekend.to && timeWindow === 'all'
            ? 'weekend'
            : '';
  const customDate = !!day && planKey !== 'today' && planKey !== 'tonight' && planKey !== 'weekend';
  const freshLine = `${lastRefresh ? `Updated ${new Date(lastRefresh).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ` : ''}${city || DEFAULT_CITY}`;
  const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const planChips: { key: 'today' | 'tonight' | 'tomorrow' | 'weekend' | 'next'; label: string; detail: string }[] = today ? [
    { key: 'today', label: 'Today', detail: shortDate(today) },
    { key: 'tonight', label: 'Tonight', detail: 'From 5pm' },
    { key: 'tomorrow', label: 'Tomorrow', detail: shortDate(addDays(today, 1)) },
    { key: 'weekend', label: 'This weekend', detail: weekend ? `${shortDate(weekend.from)} – ${shortDate(weekend.to)}` : 'Fri – Sun' },
    { key: 'next', label: 'Next week', detail: nextWeek ? `${shortDate(nextWeek.from)} – ${shortDate(nextWeek.to)}` : 'Next week' },
  ] : [];
  return (
    <div className={view === 'map' ? 'vp-map-screen min-h-screen bg-background text-foreground overflow-x-clip' : 'min-h-screen bg-background text-foreground overflow-x-clip'}>
      <Navbar savedCount={saved.length} />

      <main className={view === 'map' ? 'vp-map-main relative flex h-[calc(100dvh-var(--vp-header-offset)-var(--vp-bottom-nav-offset))] min-h-0 flex-col' : ''}>
        {view === 'board' ? (
          <div className="vp-wrap vp-page-top px-4 sm:px-6">
          <HeroCard
            priority
            image={cityHeroSrc(city)}
            title={<><span className="block">What’s on in</span><span className="vp-gradient-line block text-brand-gradient">{city || DEFAULT_CITY} tonight.</span></>}
            lede={<p>{COPY.homeHero}</p>}
          >
            <div className="mt-5 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
              <CityPicker value={city || DEFAULT_CITY} onChange={setCity} onDark />
              <AiSearchBar city={city} today={today} onShowAll={applyAiSearch} placeholder="Jazz Friday" queryRequest={askRequest} chips={false} goToPage />
            </div>
            <p className="relative mt-2 max-w-[var(--vp-measure)] text-xs text-white/80">Describe a vibe, a date, a place or a budget. Try “plan my Saturday” and I’ll line the night up in Ask.</p>
            <div className="vp-chip-row relative mt-4 flex flex-wrap gap-2">
              {[
                { label: 'Tonight', run: () => applyPlan('tonight') },
                { label: 'This weekend', run: () => applyPlan('weekend') },
                { label: 'Next week', run: () => applyPlan('next') },
                { label: 'Free', run: () => { update({ isFree: true }); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
                { label: 'Live music', run: () => { setFilters((f) => withCategories(f, ['Music'])); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
                { label: 'Date night', run: () => { if (!today) return; setDay(today); pinWindow('evening'); setFilters((f) => ({ ...withCategories(f, ['Food & Drink', 'Music', 'Arts & Culture', 'Nightlife']), dateFrom: '', dateTo: '' })); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
                { label: 'Family', run: () => { setFilters((f) => withCategories(f, ['Family'])); rememberView('list'); requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } },
              ].map((chip) => (
                <Chip key={chip.label} onDark onClick={chip.run}>{chip.label}</Chip>
              ))}
            </div>
          </HeroCard>
          </div>
        ) : null}

        <div className={view === 'map' ? 'contents' : view === 'board' ? 'vp-wrap px-4 pt-hero sm:px-6' : 'vp-wrap vp-page-top px-4 sm:px-6'}>
        {view === 'board' && <FeaturedTurnstile city={city} />}
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
          <div className="vp-wrap flex min-h-0 w-full flex-1 flex-col px-4 pb-3 sm:px-6">
            <h1 className="sr-only">Map</h1>
            <div className="vp-map-toolbar flex shrink-0 flex-col gap-[var(--vp-card-gap)] bg-background py-[var(--vp-page-top)] sm:flex-row sm:items-center">
              <div className="w-full shrink-0 sm:w-[46%] sm:max-w-[220px] lg:w-80 lg:max-w-none">
                <CityPicker value={city || DEFAULT_CITY} onChange={setCity} />
              </div>
              <div className="min-w-0 w-full sm:flex-1">
                <SearchField id="map-search" value={searchInput} onChange={setSearchInput} onClear={() => setSearchInput('')} placeholder="Search the map" label="Search events" />
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border">
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
                    <button type="button" onClick={() => setShowFilters(true)} aria-label="Filters" className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', advancedCount ? 'border-primary text-primary' : 'border-border')}>
                      <SlidersHorizontal className="h-4 w-4" /> Filters
                      {advancedCount > 0 && <span className="font-mono text-xs">{advancedCount}</span>}
                    </button>
                    {planChips.map((chip) => (
                      <button key={chip.key} type="button" aria-pressed={planKey === chip.key} onClick={() => applyPlan(chip.key)} className={cn('inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold', planKey === chip.key ? 'bg-foreground text-background' : 'bg-muted text-foreground')}>{chip.label}</button>
                    ))}
                    <span aria-hidden className="mx-1 h-5 w-px shrink-0 self-center bg-border" />
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
        {view === 'board' && <div ref={boardRef} id="line-up" className="mb-10 scroll-mt-28 overflow-hidden rounded-3xl bg-card shadow-[var(--vp-shadow-md)]">
          {view === 'board' && (
            <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold leading-tight sm:text-xl">Browse everything</h2>
                <p className="mt-0.5 text-xs leading-tight text-muted-foreground" title={freshLine}>
                  {freshLine}
                </p>
              </div>
              <ViewToggle compact value={resultsView} label="Board, list or map" options={[{ key: 'board', text: 'Board', Icon: LayoutGrid }, { key: 'list', text: 'List', Icon: LayoutList }, { key: 'map', text: 'Map', Icon: MapPin }]} onChange={(next) => { if (next === 'map') { goView('map'); return } rememberLineup(next) }} />
            </div>
          )}
          {view === 'board' &&
          <>
              <FilterBar
                dates={[
                  { key: 'today', label: 'Today', pressed: planKey === 'today', onClick: () => applyPlan('today') },
                  { key: 'tonight', label: 'Tonight', pressed: planKey === 'tonight', onClick: () => applyPlan('tonight') },
                  { key: 'weekend', label: 'This weekend', pressed: planKey === 'weekend', onClick: () => applyPlan('weekend') },
                ]}
                picker={(
                  <Popover open={calOpen} onOpenChange={(open) => {
                    setCalOpen(open);
                    if (open) {
                      const iso = filters.dateFrom || day;
                      if (iso) setCalMonth(new Date(`${iso}T12:00:00`));
                    }
                  }}>
                    <PopoverTrigger asChild>
                      <button type="button" aria-pressed={customDate} className={filterChipClass(customDate)}>
                        <CalendarDays className="h-4 w-4" /> {customDate && day ? shortDate(day) : 'Pick a date'}
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
                )}
                searchId="board-search"
                searchValue={searchInput}
                onSearch={setSearchInput}
                onClear={() => setSearchInput('')}
                searchPlaceholder="Search events or venues"
                searchLabel="Quick search by event, artist, venue or keyword"
                searchList="quick-search-hints"
                searchExtra={(
                  <datalist id="quick-search-hints">
                    {searchHints.map((title) => <option key={title} value={title} />)}
                  </datalist>
                )}
              >
                <CategoryChip active={!picked.length} onClick={() => setFilters((f) => withCategories(f, []))} label="All" Icon={LayoutGrid} />
                {CATEGORIES.map((c) => (
                  <CategoryChip key={c.name} active={picked.includes(c.name)} onClick={() => setFilters((f) => withCategories(f, picked.includes(c.name) ? picked.filter((n) => n !== c.name) : [...picked, c.name]))} label={c.name} Icon={categoryIcon(c.name)} color={c.color} />
                ))}
                <ToggleChip active={filters.isFree} onClick={() => update({ isFree: !filters.isFree })} label="Free" />
                <button type="button" onClick={() => setShowFilters(true)} aria-label="Filters" className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold', advancedCount ? 'bg-primary/15 text-primary' : 'bg-muted')}>
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                  {advancedCount > 0 && <span className="font-mono text-xs">{advancedCount}</span>}
                </button>
              </FilterBar>

              {picked.length === 1 &&
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-4">
                  {(CATEGORIES.find((c) => c.name === picked[0])?.subTags ?? []).map((t) =>
              <button
                key={t}
                onClick={() => update({ subTag: filters.subTag === t ? '' : t })}
                className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors', filters.subTag === t ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                
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
          {(boardOpen || browseCount >= 4) && <div className="flex justify-center border-t border-border px-4 py-3">
            <button type="button" onClick={() => setBoardOpen((open) => !open)} className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              {boardOpen ? 'Show the short list' : `See all ${browseCount} events`}
            </button>
          </div>}
          </>
          }
        </div>}
        </div>
      </main>

      {/* Filters drawer */}
      {showFilters && <PageScrollLock />}
      {showFilters &&
      <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[min(85dvh,40rem)] overflow-auto rounded-t-[var(--vp-radius-xl)] border-t border-border bg-background p-4 pb-[calc(var(--vp-bottom-nav-offset)+1rem)] md:inset-y-0 md:bottom-auto md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-[380px] md:rounded-none md:border-l md:border-t-0 md:pb-4">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onClose={() => setShowFilters(false)}
              isMobile
              areas={filterAreasForCity(city)}
              groups={areaGroupLabels(city)}
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
        active ? 'bg-muted text-foreground ring-1 ring-border' : 'text-foreground'
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
        'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
        active ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/80'
      )}>
      
      {active && <Check className="w-3.5 h-3.5" aria-hidden />}
      {label}
    </button>);

}