"use client";

import { useEffect, useMemo, useState } from "react";
import { pb, fishTypeLabels, type FishType } from "@/lib/pocketbase";
import { motion, AnimatePresence } from "framer-motion";

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

const TEAM_COLORS = ["#c9a227", "#7cb87c", "#cd7f32", "#8888cc"];

function formatWeight(weight: number): string {
    return weight.toFixed(3);
}

function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
}

function getTeam(id: string, teams: Team[]) {
    return teams.find((t) => t.id === id);
}


// ═══════════════════════════════════════════════════
// SCORE BUG — top centar
// ═══════════════════════════════════════════════════

function OverlayScoreBug({ tournament, teams, catches, timeLeft }: { tournament: Tournament; teams: Team[]; catches: Catch[]; timeLeft: string }) {
    const top3 = useMemo(() => {
        const list = teams.map((team, i) => {
            const teamCatches = catches.filter((c) => c.team_id === team.id);
            const totalWeight = teamCatches.reduce((s, c) => s + c.weight, 0);
            return { ...team, totalWeight, catchesCount: teamCatches.length, color: TEAM_COLORS[i % TEAM_COLORS.length] };
        });
        return list.sort((a, b) => b.totalWeight - a.totalWeight).slice(0, 3);
    }, [teams, catches]);

    return (
        <div className="flex items-stretch overflow-hidden rounded-xl border border-[#1a2e1a]/50 bg-[#060a06]/90 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-3 border-r border-[#111a11] px-5 py-3">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className={`text-[8px] font-bold uppercase tracking-wider text-red-400 ${fontHeading}`}>Live</span>
                </div>
                <div>
                    <div className={`text-[10px] font-bold uppercase tracking-wider text-[#c9a227] ${fontHeading}`}>{tournament.name}</div>
                    <div className={`text-xl font-bold tabular-nums tracking-tight text-[#f0f0f0] ${fontHeading}`}>{timeLeft}</div>
                </div>
            </div>

            <div className="flex">
                {top3.map((team, i) => (
                    <div key={team.id} className="flex items-center gap-2.5 border-r border-[#111a11] px-4 py-3 last:border-r-0">
                        <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${fontHeading}`}
                            style={{
                                backgroundColor: i === 0 ? "rgba(201,162,39,0.12)" : i === 1 ? "rgba(160,160,160,0.08)" : "rgba(205,127,50,0.08)",
                                color: i === 0 ? "#c9a227" : i === 1 ? "#a0a0a0" : "#cd7f32",
                            }}
                        >
                            {i + 1}
                        </div>
                        <div>
                            <div className={`text-[13px] font-semibold text-[#f0f0f0] ${fontHeading}`}>{team.name}</div>
                            <div className="text-[10px] text-[#666]">
                                <span className={`font-bold tabular-nums ${fontHeading} ${i === 0 ? "text-[#c9a227]" : "text-[#888]"}`}>{formatWeight(team.totalWeight)} kg</span>
                                <span className="mx-1 text-[#222]">·</span>
                                <span>{team.catchesCount}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center px-3">
                <div className="flex items-center gap-2 rounded-lg border border-[#1a2e1a]/50 bg-[#0a0f0a]/80 px-2.5 py-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#7cb87c]">
                        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                    </svg>
                    <div className={`text-sm font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>22.4°</div>
                </div>
            </div>
        </div>
    );
}


// ═══════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════

function OverlayLeaderboard({ tournament, teams, players, catches, maxItems = 5 }: { tournament: Tournament; teams: Team[]; players: Player[]; catches: Catch[]; maxItems?: number }) {
    const standings = useMemo(() => {
        const list = teams.map((team, i) => {
            const teamCatches = catches.filter((c) => c.team_id === team.id);
            const totalWeight = teamCatches.reduce((s, c) => s + c.weight, 0);
            return {
                ...team,
                players: players.filter((p) => p.team_id === team.id),
                totalWeight,
                catchesCount: teamCatches.length,
                color: TEAM_COLORS[i % TEAM_COLORS.length],
            };
        });
        return list.sort((a, b) => b.totalWeight - a.totalWeight).slice(0, maxItems);
    }, [teams, players, catches, maxItems]);

    const maxWeight = standings[0]?.totalWeight || 1;

    return (
        <div className="w-[360px] overflow-hidden rounded-xl border border-[#1a2e1a]/50 bg-[#060a06]/90 backdrop-blur-md">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <h2 className={`text-base font-bold text-[#888] ${fontHeading}`}>Plasman</h2>
                </div>
                <span className={`text-[10px] text-[#555] ${fontHeading}`}>{tournament.name}</span>
            </div>

            {standings.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#555]">Još nema rezultata.</p>
            ) : (
                <div className="space-y-1 px-2 pb-2">
                    {standings.map((team, i) => {
                        const pos = i + 1;
                        const isLeader = pos === 1;
                        const gap = isLeader ? null : (standings[0].totalWeight - team.totalWeight).toFixed(3);
                        const pct = maxWeight > 0 ? (team.totalWeight / maxWeight) * 100 : 0;

                        return (
                            <motion.div
                                key={team.id}
                                initial={{ opacity: 0, x: -15 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.06 }}
                                className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${isLeader ? "bg-[#0d140d]" : "bg-[#0a0f0a]"}`}
                            >
                                {isLeader && <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-[#c9a227]" />}
                                <div className={`w-6 shrink-0 text-right text-lg font-bold ${fontHeading} ${pos === 1 ? "text-[#c9a227]" : pos === 2 ? "text-[#a0a0a0]" : pos === 3 ? "text-[#cd7f32]" : "text-[#444]"}`}>
                                    {pos}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className={`text-[15px] font-semibold text-[#f0f0f0] ${fontHeading}`}>{team.name}</div>
                                    <div className="mt-0.5 truncate text-xs text-[#555]">
                                        {team.players.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
                                    </div>
                                    <div className="mt-2 h-0.5 w-full rounded-full bg-[#111a11]">
                                        <div className="h-0.5 rounded-full bg-[#c9a227]/30 transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className={`text-xl font-bold tabular-nums tracking-tight ${fontHeading} ${pos === 1 ? "text-[#c9a227]" : "text-[#f0f0f0]"}`}>
                                        {formatWeight(team.totalWeight)} <span className="text-xs font-normal text-[#555]">kg</span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-[#444]">
                                        {isLeader ? "Lider" : `+${gap} kg`} · {team.catchesCount} ulova
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


// ═══════════════════════════════════════════════════
// RECENT CATCHES
// ═══════════════════════════════════════════════════

function RecentCatchesWidget({ catches, teams, fishImages, maxItems = 8 }: { catches: Catch[]; teams: Team[]; fishImages: Record<FishType, string>; maxItems?: number }) {
    const recent = catches.slice(0, maxItems);

    return (
        <div className="w-[320px] overflow-hidden rounded-xl border border-[#1a2e1a]/50 bg-[#060a06]/90 backdrop-blur-md">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <h2 className={`text-sm font-medium text-[#666] ${fontHeading}`}>Poslednji ulovi</h2>
                </div>
            </div>

            {recent.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-[#555]">Još nema ulova.</div>
            ) : (
                <div className="max-h-[420px] overflow-y-auto p-1">
                    <AnimatePresence initial={false}>
                        {recent.map((c, idx) => {
                            const team = getTeam(c.team_id, teams);
                            const isNew = idx === 0;
                            return (
                                <motion.div
                                    key={c.id}
                                    initial={isNew ? { opacity: 0, x: 15 } : false}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${isNew ? "bg-[#c9a227]/5" : ""}`}
                                >
                                    <div className="shrink-0 text-[11px] tabular-nums text-[#555]">{formatTime(c.caught_at)}</div>
                                    <div className="h-7 w-10 overflow-hidden rounded bg-[#060a06]">
                                        <img src={fishImages[c.fish_type]} alt="" className="h-full w-full object-contain p-0.5" onError={(e) => ((e.target as HTMLImageElement).src = fishImages.common_carp)} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="truncate text-sm text-[#ddd]">{team?.name || "Nepoznat tim"}</span>
                                            {isNew && (
                                                <span className={`shrink-0 rounded bg-[#c9a227]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#c9a227] ${fontHeading}`}>Novo</span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-[#555]">{fishTypeLabels[c.fish_type]}</div>
                                    </div>
                                    <div className={`shrink-0 text-sm font-bold tabular-nums ${isNew ? "text-[#c9a227]" : "text-[#e0e0e0]"} ${fontHeading}`}>
                                        {formatWeight(c.weight)}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════
// CATCH ALERT — centar (namerno malo istaknutiji radi pažnje)
// ═══════════════════════════════════════════════════

function OverlayCatchAlert({ catchItem, teams, fishImages, onDismiss }: { catchItem: Catch | null; teams: Team[]; fishImages: Record<FishType, string>; onDismiss?: () => void }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (catchItem) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(() => onDismiss?.(), 400);
            }, 5500);
            return () => clearTimeout(timer);
        }
    }, [catchItem?.id, onDismiss]);

    if (!catchItem) return null;
    const team = getTeam(catchItem.team_id, teams);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ type: "spring", damping: 22, stiffness: 300 }}
                    className="pointer-events-none flex justify-center"
                >
                    <div className="relative flex items-center gap-4 overflow-hidden rounded-xl border border-[#c9a227]/30 bg-[#060a06]/95 px-7 py-4 shadow-2xl backdrop-blur-md">
                        <div className="absolute inset-0 bg-[#c9a227]/[0.03]" />
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#0a0f0a] border border-[#1a2e1a]">
                            <img src={fishImages[catchItem.fish_type]} alt="" className="h-10 w-10 object-contain" onError={(e) => ((e.target as HTMLImageElement).src = fishImages.common_carp)} />
                        </div>
                        <div className="relative">
                            <div className={`text-[10px] font-bold uppercase tracking-[0.15em] text-[#c9a227] ${fontHeading}`}>Nov ulov!</div>
                            <div className={`mt-0.5 text-lg font-bold text-[#f0f0f0] ${fontHeading}`}>{team?.name}</div>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className={`text-3xl font-bold tabular-nums text-[#c9a227] ${fontHeading}`}>{formatWeight(catchItem.weight)}</span>
                                <span className="text-sm text-[#888]">kg · {fishTypeLabels[catchItem.fish_type]}</span>
                            </div>
                        </div>
                        <div className="relative h-10 w-px bg-[#1a2e1a]" />
                        <div className="relative text-right">
                            <div className="text-xs text-[#555]">{formatTime(catchItem.caught_at)}</div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════
// SPONSOR MARQUEE
// ═══════════════════════════════════════════════════

function SponsorMarquee({ baseUrl = "" }: { baseUrl?: string }) {
    const SPONSOR_LOGOS = Array.from({ length: 9 }, (_, i) => `${baseUrl}logos/logo${i + 1}.svg`);
    const allLogos = [...SPONSOR_LOGOS, ...SPONSOR_LOGOS, ...SPONSOR_LOGOS];

    return (
        <div className="w-full overflow-hidden border-t border-[#1a2e1a]/50 bg-[#060a06]/90 backdrop-blur-md">
            <div className="flex items-center gap-3 px-6 py-3">
                <span className={`shrink-0 text-xs font-bold uppercase tracking-[0.2em] text-[#444] ${fontHeading}`}>Partneri</span>
                <div className="h-5 w-px bg-[#1a2e1a]" />
                <div className="relative flex-1 overflow-hidden">
                    <div className="flex animate-marquee items-center gap-12 whitespace-nowrap">
                        {allLogos.map((logo, i) => (
                            <div key={`${logo}-${i}`} className="flex shrink-0 items-center justify-center px-3 opacity-50 grayscale transition-opacity hover:opacity-90 hover:grayscale-0">
                                <img src={logo} alt="" className="h-8 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <style jsx>{`
                @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-33.333%); } }
                .animate-marquee { animation: marquee 30s linear infinite; }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// STREAM OVERLAY — glavna komponenta
// ═══════════════════════════════════════════════════

export default function StreamOverlay({ baseUrl = "" }: { baseUrl?: string }) {
    const fishImages: Record<FishType, string> = {
        common_carp: `${baseUrl}common_carp.png`,
        mirror_carp: `${baseUrl}mirror_carp.png`,
        grass_carp: `${baseUrl}grass_carp.png`,
    };

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [catches, setCatches] = useState<Catch[]>([]);
    const [timeLeft, setTimeLeft] = useState("00:00:00");
    const [latestCatch, setLatestCatch] = useState<Catch | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                const tournamentRes = await pb.collection("tournaments").getList<Tournament>(1, 1, { sort: "-created" });
                if (tournamentRes.items.length === 0) return;

                const t = tournamentRes.items[0];
                setTournament(t);

                const catchesRes = await pb.collection("catches").getFullList<Catch>({
                    filter: `tournament_id = "${t.id}"`,
                    sort: "-caught_at",
                });
                setCatches(catchesRes);

                let teamsRes = await pb.collection("teams").getFullList<Team>({ filter: `tournament_id = "${t.id}"` });
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
            }
        }
        loadData();
    }, []);

    useEffect(() => {
        if (!tournament) return;
        let unsubCatches: (() => void) | null = null;

        async function subscribe() {
            unsubCatches = await pb.collection("catches").subscribe<Catch>("*", (e) => {
                if (e.record.tournament_id !== tournament.id) return;
                if (e.action === "create") {
                    setCatches((prev) => [e.record, ...prev]);
                    setLatestCatch(e.record);
                } else if (e.action === "delete") {
                    setCatches((prev) => prev.filter((c) => c.id !== e.record.id));
                } else if (e.action === "update") {
                    setCatches((prev) => prev.map((c) => (c.id === e.record.id ? e.record : c)));
                }
            });
        }
        subscribe();

        return () => { unsubCatches?.(); };
    }, [tournament]);

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

    if (!tournament) return null;

        return (
            <div className={`relative h-screen w-screen overflow-hidden ${fontBody}`}>
                {/* Background video */}
                <video
                    className="absolute inset-0 z-0 h-full w-full object-cover"
                    src={`${baseUrl}fishing.mp4`}
                    autoPlay
                    loop
                    muted
                    playsInline
                />

                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20">
                    <OverlayScoreBug tournament={tournament} teams={teams} catches={catches} timeLeft={timeLeft} />
                </div>

                <div className="absolute left-6 top-4 z-10">
                    <OverlayLeaderboard tournament={tournament} teams={teams} players={players} catches={catches} maxItems={5} />
                </div>

                <div className="absolute right-6 top-4 z-10">
                    <RecentCatchesWidget catches={catches} teams={teams} fishImages={fishImages} maxItems={8} />
                </div>

                <div className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 z-30">
                    <OverlayCatchAlert catchItem={latestCatch} teams={teams} fishImages={fishImages} onDismiss={() => setLatestCatch(null)} />
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-20">
                    <SponsorMarquee baseUrl={baseUrl} />
                </div>
            </div>
        );
    }
