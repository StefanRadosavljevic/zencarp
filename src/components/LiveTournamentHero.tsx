"use client";

import { useEffect, useState } from "react";
import { pb, fishTypeLabels, type FishType } from "@/lib/pocketbase";

const fontHeading = "font-[family-name:var(--font-poppins)]";

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

type TeamStanding = {
    id: string;
    name: string;
    players: { first_name: string; last_name: string }[];
    totalWeight: number;
    fishCount: number;
    color: string;
};

function formatWeight(w: number) {
    return w.toFixed(1).replace(".", ",");
}

function formatFishType(type: FishType): string {
    return fishTypeLabels[type] || type;
}

const TEAM_COLORS = ["#c9a227", "#7cb87c", "#cd7f32", "#8888cc"];

function PlayIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M8 5v14l11-7z" /></svg>; }
function TrophyIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M6 9v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M6 9h12" /><path d="M12 17v3m-3 0h6" /></svg>; }
function MapPinIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>; }
function EyeIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>; }

export default function LiveTournamentHero() {
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [catches, setCatches] = useState<Catch[]>([]);
    const [loadingLive, setLoadingLive] = useState(true);
    const [timeLeft, setTimeLeft] = useState<string>("--:--:--");

    // Učitavanje inicijalnih podataka
    useEffect(() => {
        async function loadLiveData() {
            try {
                const tournamentRes = await pb.collection("tournaments").getList<Tournament>(1, 1, { sort: "-created" });
                if (tournamentRes.items.length === 0) {
                    setLoadingLive(false);
                    return;
                }

                const tournamentData = tournamentRes.items[0];
                setTournament(tournamentData);

                if (tournamentData.status === "in_progress") {
                    const catchesRes = await pb.collection("catches").getFullList<Catch>({
                        filter: `tournament_id = "${tournamentData.id}"`,
                        sort: "-caught_at",
                    });
                    setCatches(catchesRes);

                    let teamsRes = await pb.collection("teams").getFullList<Team>({
                        filter: `tournament_id = "${tournamentData.id}"`,
                    });

                    if (teamsRes.length === 0 && catchesRes.length > 0) {
                        const teamIds = [...new Set(catchesRes.map((c) => c.team_id))];
                        if (teamIds.length > 0) {
                            const teamFilter = teamIds.map((id) => `id = "${id}"`).join(" || ");
                            teamsRes = await pb.collection("teams").getFullList<Team>({ filter: teamFilter });
                        }
                    }
                    setTeams(teamsRes);

                    if (teamsRes.length > 0) {
                        const teamIds = teamsRes.map((t) => t.id);
                        const playersFilter = teamIds.map((id) => `team_id = "${id}"`).join(" || ");
                        const playersRes = await pb.collection("players").getFullList<Player>({ filter: playersFilter });
                        setPlayers(playersRes);
                    }
                }
            } catch (err) {
                console.error("Greška pri učitavanju live podataka:", err);
            } finally {
                setLoadingLive(false);
            }
        }
        loadLiveData();
    }, []);

    // Real-time subscription
    // Real-time subscription
    useEffect(() => {
        if (!tournament) return;
        const tournamentId = tournament.id;

        let unsubTournament: (() => void) | null = null;
        let unsubCatches: (() => void) | null = null;

        async function subscribe() {
            unsubTournament = await pb.collection("tournaments").subscribe<Tournament>(tournamentId, (e) => {
                if (e.action === "update") setTournament(e.record);
            });

            unsubCatches = await pb.collection("catches").subscribe<Catch>("*", (e) => {
                if (e.record.tournament_id !== tournamentId) return;
                if (e.action === "create") setCatches((prev) => [e.record, ...prev]);
                else if (e.action === "delete") setCatches((prev) => prev.filter((c) => c.id !== e.record.id));
                else if (e.action === "update") setCatches((prev) => prev.map((c) => (c.id === e.record.id ? e.record : c)));
            });
        }
        subscribe();

        return () => {
            unsubTournament?.();
            unsubCatches?.();
        };
    }, [tournament]);

    // Timer
    useEffect(() => {
        if (!tournament?.ends_at) {
            setTimeLeft("--:--:--");
            return;
        }
        const updateTimeLeft = () => {
            const now = Date.now();
            const end = new Date(tournament.ends_at!).getTime();
            const diff = end - now;
            if (diff <= 0) { setTimeLeft("00:00:00"); return; }
            const totalSeconds = Math.floor(diff / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            if (days > 0) {
                setTimeLeft(`${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
            } else {
                setTimeLeft(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
            }
        };
        updateTimeLeft();
        const interval = setInterval(updateTimeLeft, 1000);
        return () => clearInterval(interval);
    }, [tournament]);

    const standings: TeamStanding[] = teams
        .map((team, index) => {
            const teamCatches = catches.filter((c) => c.team_id === team.id);
            const totalWeight = teamCatches.reduce((sum, c) => sum + c.weight, 0);
            const teamPlayers = players
                .filter((p) => p.team_id === team.id)
                .map((p) => ({ first_name: p.first_name, last_name: p.last_name }));
            return {
                id: team.id,
                name: team.name,
                players: teamPlayers,
                totalWeight,
                fishCount: teamCatches.length,
                color: TEAM_COLORS[index % TEAM_COLORS.length],
            };
        })
        .sort((a, b) => b.totalWeight - a.totalWeight);

    // LOADING
    if (loadingLive) {
        return (
            <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-5">
                <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80')" }} />
                <div className="absolute inset-0 bg-linear-to-b from-[#060a06]/70 via-[#060a06]/50 to-[#060a06]/90" />
                <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-[#1a2e1a] border-t-[#c9a227]" />
                    <p className="text-sm text-[#aaa]">Učitavanje...</p>
                </div>
            </section>
        );
    }

    // LIVE TURNIR
    if (tournament && tournament.status === "in_progress") {
        return (
            <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-5">
                <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80')" }} />
                <div className="absolute inset-0 bg-linear-to-b from-[#060a06]/70 via-[#060a06]/50 to-[#060a06]/90" />
                <div className="absolute inset-0 bg-linear-to-tr from-[#0a140a]/60 via-transparent to-[#c9a227]/10" />

                <div className="relative z-10 mx-auto max-w-5xl w-full">
                    <div className="flex flex-col items-start justify-between gap-4 mb-6 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-4">
                            <img  src={`${import.meta.env.BASE_URL}zencarp_logo.png`} alt="ZenCarp" className="h-12 w-auto" />
                            <div>
                                <div className="mb-1 flex items-center gap-2">
                                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#c9a227]" />
                                    <span className={`text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Uživo</span>
                                </div>
                                <h1 className={`text-2xl font-extrabold text-[#f0f0f0] sm:text-3xl ${fontHeading}`}>{tournament.name}</h1>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/80 px-6 py-3 backdrop-blur-sm">
                            <div className={`mb-1 text-xs font-bold uppercase tracking-wider text-[#7cb87c] ${fontHeading}`}>Preostalo vreme</div>
                            <div className={`text-2xl font-extrabold tabular-nums text-[#c9a227] ${fontHeading}`}>{timeLeft}</div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[#1a2e1a]/60 bg-[#0d140d]/80 p-4 backdrop-blur-sm">
                        <div className="grid grid-cols-[30px_1fr_auto_auto] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[#666]">
                            <span>#</span>
                            <span>Tim</span>
                            <span className="text-right">Težina</span>
                            <span className="text-right">Ulova</span>
                        </div>
                        {standings.length === 0 ? (
                            <p className="text-sm text-[#666] py-4 text-center">Još nema ulova.</p>
                        ) : (
                            <div className="mt-2 space-y-1">
                                {standings.map((team, i) => {
                                    const medalColors = ["#c9a227", "#a0a0a0", "#cd7f32", "#1a2e1a"];
                                    const medalText = ["#0a0f0a", "#0a0f0a", "#0a0f0a", "#7cb87c"];
                                    return (
                                        <div key={team.id} className="relative grid grid-cols-[30px_1fr_auto_auto] items-center gap-2 rounded-lg bg-[#060a06]/40 px-2 py-1.5 hover:bg-[#ffffff08] transition-colors">
                                            <span className="absolute bottom-0 left-0 top-0 w-0.5 rounded-l" style={{ background: team.color }} />
                                            <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold shadow-sm" style={{ background: medalColors[i], color: medalText[i] }}>{i + 1}</div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold leading-tight text-white">{team.name}</div>
                                                <div className="truncate text-[10px] text-[#888]">{team.players.map(p => `${p.first_name} ${p.last_name}`).join(", ")}</div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-base font-extrabold tabular-nums" style={{ color: i === 0 ? "#c9a227" : i === 1 ? "#e8e8e8" : i === 2 ? "#cd7f32" : "#bbb" }}>{formatWeight(team.totalWeight)} kg</span>
                                                {i === 0 ? <span className="text-[8px] font-bold uppercase tracking-wider text-[#c9a227]">Lider</span> : <span className="text-[9px] font-semibold tabular-nums text-[#888]">+{formatWeight(standings[0].totalWeight - team.totalWeight)} kg</span>}
                                            </div>
                                            <div className="text-right text-[10px] text-[#666] tabular-nums">{team.fishCount}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 text-center">
                        <a href="/results" className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[#0a0f0a] shadow-lg shadow-[#c9a227]/20 transition-transform hover:scale-105 ${fontHeading}`}>
                            <EyeIcon className="h-4 w-4" /> Pogledaj sve rezultate
                        </a>
                    </div>
                </div>
            </section>
        );
    }

    // DEFAULT HERO (nema turnira ili nije u toku)
    return (
        <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-5">
            <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80')" }} />
            <div className="absolute inset-0 bg-linear-to-b from-[#060a06]/70 via-[#060a06]/50 to-[#060a06]/90" />
            <div className="absolute inset-0 bg-linear-to-tr from-[#0a140a]/60 via-transparent to-[#c9a227]/10" />
            <div className="relative z-10 mx-auto max-w-4xl text-center">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1a2e1a] bg-[#0d140d]/80 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#7cb87c] backdrop-blur-sm">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9a227]" /> Prvi ZenCarp turnir — nova ideja, prva probna verzija
                </div>
                <img  src={`${BASE}zencarp_logo.png`} alt="ZenCarp" className="mx-auto mb-6 h-40 w-auto drop-shadow-[0_4px_40px_rgba(201,162,39,0.3)] sm:h-52" />
                <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-[#ddd] sm:text-xl">
                    Četiri ekipe. Četiri sata. Jedno jezero. <br className="hidden sm:block" /> Prenos uživo i rezultati u realnom vremenu — probamo prvi put.
                </p>
                <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <a href="#prijava" className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[#0a0f0a] shadow-lg shadow-[#c9a227]/20 transition-transform hover:scale-105 ${fontHeading}`}>
                        <TrophyIcon className="h-4 w-4" /> Prijavi ekipu
                    </a>
                    <a href="#prenos" className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d140d]/60 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-[#e0e0e0] backdrop-blur-sm transition-colors hover:border-[#c9a227]/40 hover:text-[#c9a227] ${fontHeading}`}>
                        <PlayIcon className="h-4 w-4" /> Gledaj prenos
                    </a>
                </div>
                <div className="inline-flex items-center gap-3 rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/70 px-6 py-4 backdrop-blur-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c9a227]/10 text-[#c9a227]">
                        <MapPinIcon className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <div className={`text-xs font-bold uppercase tracking-wider text-[#7cb87c] ${fontHeading}`}>Kada & gde</div>
                        <div className="text-sm font-semibold text-[#e0e0e0]">Vojvoda Stepa — Uskoro</div>
                    </div>
                </div>
            </div>
        </section>
    );
}
