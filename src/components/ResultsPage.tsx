"use client";

import { useEffect, useMemo, useState } from "react";
import { pb, fishTypeLabels, type FishType } from "@/lib/pocketbase";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";

const fontHeading = "font-[family-name:var(--font-poppins)]";
const fontBody = "font-[family-name:var(--font-inter)]";

type Tournament = {
    id: string;
    name: string;
    status: "upcoming" | "in_progress" | "completed";
    starts_at: string | null;
    ends_at: string | null;
};

type Team = { id: string; name: string; tournament_id: string };
type Player = { id: string; team_id: string; first_name: string; last_name: string; age: number };
type Catch = { id: string; tournament_id: string; team_id: string; fish_type: FishType; weight: number; caught_at: string };

type TeamStanding = Team & {
    players: Player[];
    totalWeight: number;
    catchesCount: number;
    avgWeight: number;
    color: string;
};

type SortMode = "weight" | "count" | "avg";
type CatchSort = "time" | "weight";

const TEAM_COLORS = ["#c9a227", "#7cb87c", "#cd7f32", "#8888cc"];

function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
}

function formatWeight(weight: number): string {
    return weight.toFixed(3);
}

function formatFishType(type: FishType): string {
    return fishTypeLabels[type] || type;
}

function timeAgo(date: string): string {
    const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diffSec < 30) return "Upravo sada";
    if (diffSec < 60) return `pre ${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `pre ${min} min`;
    const h = Math.floor(min / 60);
    return `pre ${h}h ${min % 60}min`;
}

function getHourLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-[#1a2e1a] bg-[#0a0f0a] px-3 py-2 shadow-xl">
            <div className={`mb-1 text-[11px] font-medium text-[#888] ${fontHeading}`}>{label}</div>
            <div className={`text-sm font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>
                {payload[0].value} {payload[0].value === 1 ? "ulov" : "ulova"}
            </div>
        </div>
    );
}

interface ResultsPageProps {
    baseUrl?: string;
}

export default function ResultsPage({ baseUrl = "" }: ResultsPageProps) {
    const fishImages: Record<FishType, string> = {
        common_carp: `${baseUrl}common_carp.png`,
        mirror_carp: `${baseUrl}mirror_carp.png`,
        grass_carp: `${baseUrl}grass_carp.png`,
    };

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [catches, setCatches] = useState<Catch[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState<string>("00:00:00");
    const [sortMode, setSortMode] = useState<SortMode>("weight");
    const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
    const [catchSort, setCatchSort] = useState<CatchSort>("time");

    // ── Load data ──
    useEffect(() => {
        async function loadData() {
            try {
                const tournamentRes = await pb.collection("tournaments").getList<Tournament>(1, 1, { sort: "-created" });
                if (tournamentRes.items.length === 0) {
                    setLoading(false);
                    return;
                }

                const t = tournamentRes.items[0];
                setTournament(t);

                const catchesRes = await pb.collection("catches").getFullList<Catch>({
                    filter: `tournament_id = "${t.id}"`,
                    sort: "-caught_at",
                });
                setCatches(catchesRes);

                let teamsRes = await pb.collection("teams").getFullList<Team>({
                    filter: `tournament_id = "${t.id}"`,
                });

                if (teamsRes.length === 0 && catchesRes.length > 0) {
                    const teamIds = [...new Set(catchesRes.map((c) => c.team_id))];
                    if (teamIds.length > 0) {
                        const filter = teamIds.map((id) => `id = "${id}"`).join(" || ");
                        teamsRes = await pb.collection("teams").getFullList<Team>({ filter });
                    }
                }
                setTeams(teamsRes);

                if (teamsRes.length > 0) {
                    const filter = teamsRes.map((t) => `team_id = "${t.id}"`).join(" || ");
                    const playersRes = await pb.collection("players").getFullList<Player>({ filter });
                    setPlayers(playersRes);
                }
            } catch (err) {
                console.error("Greška pri učitavanju:", err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // ── Real-time ──
    useEffect(() => {
        if (!tournament) return;
        let unsubCatches: (() => void) | null = null;
        let unsubTournament: (() => void) | null = null;

        async function subscribe() {
            unsubCatches = await pb.collection("catches").subscribe<Catch>("*", (e) => {
                if (e.record.tournament_id !== tournament.id) return;
                if (e.action === "create") setCatches((prev) => [e.record, ...prev]);
                else if (e.action === "delete") setCatches((prev) => prev.filter((c) => c.id !== e.record.id));
                else if (e.action === "update") setCatches((prev) => prev.map((c) => (c.id === e.record.id ? e.record : c)));
            });

            unsubTournament = await pb.collection("tournaments").subscribe<Tournament>(tournament.id, (e) => {
                if (e.action === "update") setTournament(e.record);
            });
        }
        subscribe();

        return () => {
            unsubCatches?.();
            unsubTournament?.();
        };
    }, [tournament]);

    // ── Countdown ──
    useEffect(() => {
        if (!tournament?.ends_at) return;
        const tick = () => {
            const diff = new Date(tournament.ends_at!).getTime() - Date.now();
            if (diff <= 0) { setTimeLeft("00:00:00"); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [tournament]);

    // ── Derived ──
    const standings: TeamStanding[] = useMemo(() => {
        const list = teams.map((team, i) => {
            const teamCatches = catches.filter((c) => c.team_id === team.id);
            const totalWeight = teamCatches.reduce((s, c) => s + c.weight, 0);
            return {
                ...team,
                players: players.filter((p) => p.team_id === team.id),
                totalWeight,
                catchesCount: teamCatches.length,
                avgWeight: teamCatches.length > 0 ? totalWeight / teamCatches.length : 0,
                color: TEAM_COLORS[i % TEAM_COLORS.length],
            };
        });

        if (sortMode === "weight") return list.sort((a, b) => b.totalWeight - a.totalWeight);
        if (sortMode === "count") return list.sort((a, b) => b.catchesCount - a.catchesCount);
        return list.sort((a, b) => b.avgWeight - a.avgWeight);
    }, [teams, players, catches, sortMode]);

    const maxWeight = standings[0]?.totalWeight || 1;
    const topCatches = useMemo(() => [...catches].sort((a, b) => b.weight - a.weight).slice(0, 5), [catches]);
    const biggestCatch = topCatches[0] || null;
    const latestCatches = catches.slice(0, 20);

    const detailTeam = detailTeamId ? standings.find((t) => t.id === detailTeamId) || null : null;
    const detailCatches = useMemo(() => {
        if (!detailTeamId) return [];
        let list = catches.filter((c) => c.team_id === detailTeamId);
        if (catchSort === "weight") list = [...list].sort((a, b) => b.weight - a.weight);
        else list = [...list].sort((a, b) => new Date(b.caught_at).getTime() - new Date(a.caught_at).getTime());
        return list;
    }, [catches, detailTeamId, catchSort]);

    const hourlyData = useMemo(() => {
        if (!detailTeamId) return [];
        const map = new Map<string, number>();
        detailCatches.forEach((c) => {
            const h = getHourLabel(c.caught_at);
            map.set(h, (map.get(h) || 0) + 1);
        });
        return Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([hour, count]) => ({ hour, count }));
    }, [detailCatches, detailTeamId]);

    const getTeam = (id: string) => teams.find((t) => t.id === id);

    // ── Render ──
    if (loading) {
        return (
            <div className={`flex min-h-screen items-center justify-center bg-[#060a06] ${fontBody}`}>
                <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#1a2e1a] border-t-[#c9a227]" />
                    <p className="text-sm text-[#666]">Učitavanje rezultata...</p>
                </div>
            </div>
        );
    }

    if (!tournament) {
        return (
            <div className={`flex min-h-screen items-center justify-center bg-[#060a06] px-6 ${fontBody}`}>
                <p className="text-lg text-[#666]">Trenutno nema aktivnog turnira.</p>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[#060a06] text-[#e0e0e0] ${fontBody}`}>
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

                {/* ═══════ HEADER ═══════ */}
                <header className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex items-center gap-4">
                        <img src={`${baseUrl}zencarp_logo.png`} alt="ZenCarp" className="h-10 w-auto opacity-90" />
                        <div>
                            {tournament.status === "in_progress" && (
                                <div className="mb-1 flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className={`text-[11px] font-bold uppercase tracking-wider text-red-400 ${fontHeading}`}>Uživo</span>
                                </div>
                            )}
                            <h1 className={`text-2xl font-bold tracking-tight text-[#f0f0f0] sm:text-3xl ${fontHeading}`}>
                                {tournament.name}
                            </h1>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className={`text-[10px] font-medium uppercase tracking-wider text-[#7cb87c] ${fontHeading}`}>Preostalo vreme</div>
                        <div className={`text-2xl font-bold tabular-nums tracking-tight text-[#c9a227] ${fontHeading}`}>{timeLeft}</div>
                    </div>
                </header>

                {/* ═══════ MAIN GRID ═══════ */}
                <div className="grid gap-8 lg:grid-cols-3">

                    {/* ─── LEFT: 2 cols ─── */}
                    <div className="space-y-8 lg:col-span-2">

                        {/* PLASMAN */}
                        <section>
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className={`text-base font-bold text-[#888] ${fontHeading}`}>Plasman</h2>
                                <div className="flex gap-1">
                                    {([
                                        { key: "weight" as SortMode, label: "Težina" },
                                        { key: "count" as SortMode, label: "Broj" },
                                        { key: "avg" as SortMode, label: "Prosek" },
                                    ]).map((s) => (
                                        <button
                                            key={s.key}
                                            onClick={() => setSortMode(s.key)}
                                            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${sortMode === s.key ? "bg-[#c9a227] text-[#0a0f0a]" : "text-[#555] hover:text-[#ccc]"}`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {standings.length === 0 ? (
                                <p className="py-8 text-center text-sm text-[#555]">Još nema rezultata.</p>
                            ) : (
                                <div className="space-y-1">
                                    {standings.map((team, i) => {
                                        const pos = i + 1;
                                        const isLeader = pos === 1;
                                        const gap = isLeader ? null : (standings[0].totalWeight - team.totalWeight).toFixed(3);
                                        const pct = maxWeight > 0 ? (team.totalWeight / maxWeight) * 100 : 0;

                                        return (
                                            <button
                                                key={team.id}
                                                onClick={() => setDetailTeamId(team.id)}
                                                className={`group relative flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left transition-all ${isLeader ? "bg-[#0d140d]" : "bg-[#0a0f0a] hover:bg-[#0d140d]"}`}
                                            >
                                                {/* Leader accent line */}
                                                {isLeader && <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-[#c9a227]" />}

                                                {/* Rank */}
                                                <div className={`w-6 shrink-0 text-right text-lg font-bold ${fontHeading} ${pos === 1 ? "text-[#c9a227]" : pos === 2 ? "text-[#a0a0a0]" : pos === 3 ? "text-[#cd7f32]" : "text-[#444]"}`}>
                                                    {pos}
                                                </div>

                                                {/* Team info */}
                                                <div className="min-w-0 flex-1">
                                                    <div className={`text-[15px] font-semibold text-[#f0f0f0] ${fontHeading}`}>{team.name}</div>
                                                    <div className="mt-0.5 truncate text-xs text-[#555]">
                                                        {team.players.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
                                                    </div>
                                                    {/* Subtle weight bar */}
                                                    <div className="mt-2 h-0.5 w-full rounded-full bg-[#111a11]">
                                                        <div className="h-0.5 rounded-full bg-[#c9a227]/30 transition-all" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>

                                                {/* Weight */}
                                                <div className="shrink-0 text-right">
                                                    <div className={`text-xl font-bold tabular-nums tracking-tight ${fontHeading} ${pos === 1 ? "text-[#c9a227]" : "text-[#f0f0f0]"}`}>
                                                        {formatWeight(team.totalWeight)} <span className="text-xs font-normal text-[#555]">kg</span>
                                                    </div>
                                                    <div className="mt-0.5 text-[11px] text-[#444]">
                                                        {isLeader ? "Lider" : `+${gap} kg`} · {team.catchesCount} ulova
                                                    </div>
                                                </div>

                                                {/* Arrow */}
                                                <div className="shrink-0 text-[#333] transition-colors group-hover:text-[#555]">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* ─── RIGHT: 1 col ─── */}
                    <div className="space-y-8">

                        {/* NAJVEĆI ULOV */}
                        <section className="rounded-xl bg-[#0a0f0a] overflow-hidden">
                            <div className="px-5 pt-4 pb-3">
                                <h2 className={`text-sm font-medium text-[#666] ${fontHeading}`}>Najveći ulov</h2>
                            </div>

                            {biggestCatch ? (
                                <div>
                                    <div className="relative bg-[#060a06]">
                                        <img
                                            src={fishImages[biggestCatch.fish_type]}
                                            alt={formatFishType(biggestCatch.fish_type)}
                                            className="h-auto w-full object-contain"
                                            style={{ aspectRatio: "16/9" }}
                                            onError={(e) => ((e.target as HTMLImageElement).src = fishImages.common_carp)}
                                        />
                                        <div className="absolute inset-0 bg-linear-to-t from-[#0a0f0a] via-transparent to-transparent" />
                                    </div>
                                    <div className="px-5 pb-5 pt-3">
                                        <div className={`text-3xl font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>
                                            {formatWeight(biggestCatch.weight)} <span className="text-base font-normal text-[#c9a227]/60">kg</span>
                                        </div>
                                        <div className="mt-0.5 text-sm text-[#ccc]">{formatFishType(biggestCatch.fish_type)}</div>
                                        <div className="text-xs text-[#666]">{getTeam(biggestCatch.team_id)?.name}</div>
                                        <div className="mt-2 text-[11px] tabular-nums text-[#444]">
                                            {formatTime(biggestCatch.caught_at)} · {timeAgo(biggestCatch.caught_at)}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="px-5 py-8 text-center text-sm text-[#555]">Još nema ulova.</div>
                            )}
                        </section>

                        {/* TOP 5 */}
                        <section className="rounded-xl bg-[#0a0f0a]">
                            <div className="border-b border-[#111a11] px-5 py-3">
                                <h2 className={`text-sm font-medium text-[#666] ${fontHeading}`}>Top 5 ulova</h2>
                            </div>

                            {topCatches.length === 0 ? (
                                <div className="px-5 py-8 text-center text-sm text-[#555]">Još nema ulova.</div>
                            ) : (
                                <div>
                                    {topCatches.map((c, i) => {
                                        const team = getTeam(c.team_id);
                                        return (
                                            <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                                                <div className={`w-5 text-right text-sm font-bold ${fontHeading} ${i === 0 ? "text-[#c9a227]" : i === 1 ? "text-[#a0a0a0]" : i === 2 ? "text-[#cd7f32]" : "text-[#444]"}`}>
                                                    {i + 1}
                                                </div>
                                                <div className="h-8 w-12 overflow-hidden rounded bg-[#060a06]">
                                                    <img src={fishImages[c.fish_type]} alt="" className="h-full w-full object-contain p-0.5" onError={(e) => ((e.target as HTMLImageElement).src = fishImages.common_carp)} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm text-[#e0e0e0]">{formatFishType(c.fish_type)}</div>
                                                    <div className="text-xs text-[#555]">{team?.name || "Nepoznat tim"}</div>
                                                </div>
                                                <div className={`text-sm font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>
                                                    {formatWeight(c.weight)} <span className="text-[10px] font-normal text-[#555]">kg</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* POSLEDNJI ULOVI */}
                        <section className="rounded-xl bg-[#0a0f0a]">
                            <div className="border-b border-[#111a11] px-5 py-3">
                                <h2 className={`text-sm font-medium text-[#666] ${fontHeading}`}>Poslednji ulovi</h2>
                            </div>

                            {latestCatches.length === 0 ? (
                                <div className="px-5 py-8 text-center text-sm text-[#555]">Još nema ulova.</div>
                            ) : (
                                <div className="max-h-96 overflow-y-auto">
                                    {latestCatches.map((c, idx) => {
                                        const team = getTeam(c.team_id);
                                        const isNew = idx === 0;
                                        return (
                                            <div key={c.id} className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${isNew ? "bg-[#c9a227]/5" : "hover:bg-[#ffffff03]"}`}>
                                                <div className="shrink-0 text-[11px] tabular-nums text-[#555]">{formatTime(c.caught_at)}</div>
                                                <div className="h-7 w-10 overflow-hidden rounded bg-[#060a06]">
                                                    <img src={fishImages[c.fish_type]} alt="" className="h-full w-full object-contain p-0.5" onError={(e) => ((e.target as HTMLImageElement).src = fishImages.common_carp)} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="truncate text-sm text-[#ddd]">{team?.name || "Nepoznat tim"}</span>
                                                        {isNew && <span className={`shrink-0 rounded bg-[#c9a227]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#c9a227] ${fontHeading}`}>Novo</span>}
                                                    </div>
                                                    <div className="text-[11px] text-[#555]">{formatFishType(c.fish_type)}</div>
                                                </div>
                                                <div className={`shrink-0 text-sm font-bold tabular-nums ${isNew ? "text-[#c9a227]" : "text-[#e0e0e0]"} ${fontHeading}`}>
                                                    {formatWeight(c.weight)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                {/* Footer */}
                <footer className="mt-16 border-t border-[#111a11] pt-6 text-center">
                    <p className="text-xs text-[#333]">© 2026 ZenCarp</p>
                </footer>
            </div>

            {/* ═══════ TEAM DETAIL MODAL ═══════ */}
            {detailTeam && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#060a06]/70" onClick={() => setDetailTeamId(null)} />
                    <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0a0f0a] shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5">
                            <div>
                                <div className={`text-xl font-bold text-[#f0f0f0] ${fontHeading}`}>{detailTeam.name}</div>
                                <div className="text-xs text-[#555]">{detailTeam.players.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}</div>
                            </div>
                            <button
                                onClick={() => setDetailTeamId(null)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[#555] transition-colors hover:bg-[#1a2e1a] hover:text-[#f0f0f0]"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="px-6 pb-6 space-y-6">
                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-xl bg-[#060a06] p-4 text-center">
                                    <div className={`text-2xl font-bold tabular-nums text-[#c9a227] ${fontHeading}`}>{formatWeight(detailTeam.totalWeight)}</div>
                                    <div className="mt-1 text-[10px] text-[#555]">kg ukupno</div>
                                </div>
                                <div className="rounded-xl bg-[#060a06] p-4 text-center">
                                    <div className={`text-2xl font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>{detailTeam.catchesCount}</div>
                                    <div className="mt-1 text-[10px] text-[#555]">ulova</div>
                                </div>
                                <div className="rounded-xl bg-[#060a06] p-4 text-center">
                                    <div className={`text-2xl font-bold tabular-nums text-[#888] ${fontHeading}`}>{formatWeight(detailTeam.avgWeight)}</div>
                                    <div className="mt-1 text-[10px] text-[#555]">prosek</div>
                                </div>
                            </div>

                            {/* Chart */}
                            {hourlyData.length > 0 && (
                                <div>
                                    <div className={`mb-3 text-xs font-medium text-[#666] ${fontHeading}`}>Aktivnost po satima</div>
                                    <div className="h-48 rounded-xl bg-[#060a06] p-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                <XAxis
                                                    dataKey="hour"
                                                    tick={{ fill: "#555", fontSize: 11 }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis
                                                    tick={{ fill: "#555", fontSize: 11 }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    allowDecimals={false}
                                                />
                                                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#1a2e1a", opacity: 0.2 }} />
                                                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                                                    {hourlyData.map((entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={entry.count === Math.max(...hourlyData.map((d) => d.count)) ? detailTeam.color : `${detailTeam.color}50`}
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Catches List */}
                            <div>
                                <div className="mb-3 flex items-center justify-between">
                                    <div className={`text-xs font-medium text-[#666] ${fontHeading}`}>Ulovi</div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCatchSort("time")}
                                            className={`text-[11px] font-medium transition-colors ${catchSort === "time" ? "text-[#c9a227]" : "text-[#444] hover:text-[#888]"}`}
                                        >
                                            Vreme
                                        </button>
                                        <button
                                            onClick={() => setCatchSort("weight")}
                                            className={`text-[11px] font-medium transition-colors ${catchSort === "weight" ? "text-[#c9a227]" : "text-[#444] hover:text-[#888]"}`}
                                        >
                                            Težina
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    {detailCatches.map((c) => (
                                        <div key={c.id} className="flex items-center gap-3 rounded-lg bg-[#060a06] px-4 py-2.5">
                                            <div className="h-7 w-10 overflow-hidden rounded bg-[#0a0f0a]">
                                                <img src={fishImages[c.fish_type]} alt="" className="h-full w-full object-contain p-0.5" onError={(e) => ((e.target as HTMLImageElement).src = fishImages.common_carp)} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm text-[#ccc]">{formatFishType(c.fish_type)}</div>
                                                <div className="text-[11px] text-[#555]">{formatTime(c.caught_at)} · {timeAgo(c.caught_at)}</div>
                                            </div>
                                            <div className={`text-sm font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>
                                                {formatWeight(c.weight)} <span className="text-[10px] font-normal text-[#555]">kg</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}