"use client";

import { useEffect, useState } from "react";
import { pb, fishTypeLabels, type FishType } from "@/lib/pocketbase";

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

type TeamStanding = {
    id: string;
    name: string;
    players: { first_name: string; last_name: string }[];
    totalWeight: number;
    fishCount: number;
    color: string;
};

function formatWeight(w: number) {
    return w.toFixed(2).replace(".", ",");
}

const TEAM_COLORS = ["#c9a227", "#7cb87c", "#cd7f32", "#8888cc"];

function PlayIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M8 5v14l11-7z" /></svg>;
}
function TrophyIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M6 9v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M6 9h12" /><path d="M12 17v3m-3 0h6" /></svg>;
}
function MapPinIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className={className}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>;
}
function EyeIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

interface LiveTournamentHeroProps {
    baseUrl?: string;
}

export default function LiveTournamentHero({ baseUrl = "" }: LiveTournamentHeroProps) {
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [catches, setCatches] = useState<Catch[]>([]);
    const [loadingLive, setLoadingLive] = useState(true);
    const [timeLeft, setTimeLeft] = useState<string>("--:--:--");

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

    const maxWeight = standings[0]?.totalWeight || 1;

    if (loadingLive) {
        return (
            <section className={`flex min-h-[80vh] items-center justify-center ${fontBody}`}>
                <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#1a2e1a] border-t-[#c9a227]" />
                    <p className="text-sm text-[#666]">Učitavanje...</p>
                </div>
            </section>
        );
    }

    if (tournament && tournament.status === "in_progress") {
        return (
            <section className={`relative min-h-[90vh] overflow-hidden ${fontBody}`}>
                {/* Video background */}
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                    poster="https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80"
                >
                    <source src={`${baseUrl}fishing.mp4`} type="video/mp4" />
                </video>

                {/* Dark overlay for readability */}
                <div className="absolute inset-0 bg-[#060a06]/75" />

                {/* Content */}
                <div className="relative z-10 px-5 py-16">
                    <div className="mx-auto max-w-5xl">
                        {/* Header */}
                        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div className="flex items-center gap-4">
                                <img src={`${baseUrl}zencarp_logo.png`} alt="ZenCarp" className="h-10 w-auto opacity-90" />
                                <div>
                                    <div className="mb-1 flex items-center gap-2">
                                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                                        <span className={`text-[11px] font-bold uppercase tracking-wider text-red-400 ${fontHeading}`}>Uživo</span>
                                    </div>
                                    <h1 className={`text-2xl font-bold tracking-tight text-[#f0f0f0] sm:text-3xl ${fontHeading}`}>{tournament.name}</h1>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`text-[10px] font-medium uppercase tracking-wider text-[#7cb87c] ${fontHeading}`}>Preostalo vreme</div>
                                <div className={`text-2xl font-bold tabular-nums tracking-tight text-[#c9a227] ${fontHeading}`}>{timeLeft}</div>
                            </div>
                        </div>

                        {/* Standings */}
                        <div className="space-y-2">
                            {standings.length === 0 ? (
                                <p className="py-8 text-center text-sm text-[#aaa]">Još nema ulova.</p>
                            ) : (
                                standings.map((team, i) => {
                                    const isLeader = i === 0;
                                    const gap = isLeader ? null : (standings[0].totalWeight - team.totalWeight).toFixed(2).replace(".", ",");
                                    const pct = maxWeight > 0 ? (team.totalWeight / maxWeight) * 100 : 0;

                                    return (
                                        <div
                                            key={team.id}
                                            className={`group relative flex items-center gap-4 rounded-xl px-5 py-4 ${isLeader ? "bg-[#0a0f0a]/90" : "bg-[#060a06]/80"}`}
                                        >
                                            {isLeader && <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-[#c9a227]" />}

                                            {/* Rank */}
                                            <div className={`w-6 shrink-0 text-right text-lg font-bold ${fontHeading} ${isLeader ? "text-[#c9a227]" : "text-[#444]"}`}>
                                                {i + 1}
                                            </div>

                                            {/* Info */}
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-[15px] font-semibold text-[#f0f0f0] ${fontHeading}`}>{team.name}</div>
                                                <div className="mt-0.5 truncate text-xs text-[#666]">
                                                    {team.players.map(p => `${p.first_name} ${p.last_name}`).join(", ")}
                                                </div>
                                                <div className="mt-2 h-0.5 w-full rounded-full bg-[#1a2e1a]">
                                                    <div className="h-0.5 rounded-full bg-[#c9a227]/40 transition-all" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>

                                            {/* Weight */}
                                            <div className="shrink-0 text-right">
                                                <div className={`text-xl font-bold tabular-nums tracking-tight ${fontHeading} ${isLeader ? "text-[#c9a227]" : "text-[#f0f0f0]"}`}>
                                                    {formatWeight(team.totalWeight)} <span className="text-xs font-normal text-[#555]">kg</span>
                                                </div>
                                                <div className="mt-0.5 text-[11px] text-[#555]">
                                                    {isLeader ? "Lider" : `+${gap} kg`} · {team.fishCount} ulova
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* CTA */}
                        <div className="mt-8 text-center">
                            <a
                                href={`${baseUrl}results`}
                                className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3 text-sm font-medium text-[#0a0f0a] transition-colors hover:bg-[#d4b43a] ${fontHeading}`}
                            >
                                <EyeIcon className="h-4 w-4" /> Pogledaj sve rezultate
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    // Hero / no tournament
    return (
        <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
            {/* Video background */}
            <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                poster="https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80"
            >
                <source src="https://videos.pexels.com/video-files/855029/855029-hd_1920_1080_30fps.mp4" type="video/mp4" />
            </video>

            <div className="absolute inset-0 bg-[#060a06]/60" />

            <div className="relative z-10 mx-auto max-w-4xl px-5 text-center">
                <img src={`${baseUrl}zencarp_logo.png`} alt="ZenCarp" className="mx-auto mb-8 h-36 w-auto opacity-90 sm:h-44" />

                <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-[#ccc] sm:text-xl">
                    Četiri ekipe. Četiri sata. Jedno jezero. <br className="hidden sm:block" />
                    Prenos uživo i rezultati koji se ažuriraju u stvarnom vremenu.
                </p>

                <div className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <a href="#prijava" className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3.5 text-sm font-medium text-[#0a0f0a] transition-colors hover:bg-[#d4b43a] ${fontHeading}`}>
                        <TrophyIcon className="h-4 w-4" /> Prijavi ekipu
                    </a>
                    <a href="#prenos" className={`inline-flex items-center gap-2 rounded-full border border-[#1a2e1a] bg-[#0a0f0a]/80 px-8 py-3.5 text-sm font-medium text-[#e0e0e0] transition-colors hover:border-[#c9a227]/40 hover:text-[#c9a227] ${fontHeading}`}>
                        <PlayIcon className="h-4 w-4" /> Gledaj prenos
                    </a>
                </div>

                <div className="inline-flex items-center gap-3 rounded-xl bg-[#0a0f0a]/80 px-6 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c9a227]/10 text-[#c9a227]">
                        <MapPinIcon className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <div className={`text-xs font-medium text-[#7cb87c] ${fontHeading}`}>Kada & gde</div>
                        <div className="text-sm font-medium text-[#e0e0e0]">Uskoro — Vojvoda Stepa</div>
                    </div>
                </div>
            </div>
        </section>
    );
}