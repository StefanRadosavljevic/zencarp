"use client";

import { useEffect, useMemo, useState } from "react";
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

type TeamStanding = Team & {
    players: Player[];
    totalWeight: number;
    catchesCount: number;
    color: string;
};

const TEAM_COLORS = ["#c9a227", "#7cb87c", "#cd7f32", "#8888cc"];

function formatWeight(weight: number): string {
    return weight.toFixed(2);
}

function formatFishType(type: FishType): string {
    return fishTypeLabels[type] || type;
}

function formatTimeShort(date: string): string {
    return new Date(date).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
}

export default function StreamOverlay() {
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [catches, setCatches] = useState<Catch[]>([]);
    const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

    // ── Load data ──
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
                console.error("Greška:", err);
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
        return teams
            .map((team, i) => {
                const teamCatches = catches.filter((c) => c.team_id === team.id);
                return {
                    ...team,
                    players: players.filter((p) => p.team_id === team.id),
                    totalWeight: teamCatches.reduce((s, c) => s + c.weight, 0),
                    catchesCount: teamCatches.length,
                    color: TEAM_COLORS[i % TEAM_COLORS.length],
                };
            })
            .sort((a, b) => b.totalWeight - a.totalWeight);
    }, [teams, players, catches]);

    const latestCatch = catches[0] || null;
    const biggestCatch = useMemo(() => {
        if (catches.length === 0) return null;
        return [...catches].sort((a, b) => b.weight - a.weight)[0];
    }, [catches]);

    const getTeam = (id: string) => teams.find((t) => t.id === id);

    if (!tournament) {
        return (
            <div className={`flex h-screen w-screen items-center justify-center ${fontBody}`}>
                <div className="text-sm text-[#555]">Učitavanje...</div>
            </div>
        );
    }

    return (
        <div className={`relative h-screen w-screen overflow-hidden ${fontBody}`}>
            {/* 
              POZADINA JE PROZIRNA — ovo ide preko OBS video source-a
              Dodaj ovu stranicu kao Browser Source u OBS, širina 1920, visina 1080
            */}

            {/* ═══════ TOP BAR ═══════ */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between bg-[#060a06]/85 px-8 py-4 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <span className={`text-xl font-bold text-[#f0f0f0] ${fontHeading}`}>{tournament.name}</span>
                    {tournament.status === "in_progress" && (
                        <span className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                            <span className={`text-xs font-bold uppercase text-red-400 ${fontHeading}`}>Uživo</span>
                        </span>
                    )}
                </div>
                <div className="text-right">
                    <div className={`text-xs text-[#7cb87c] ${fontHeading}`}>Preostalo</div>
                    <div className={`text-3xl font-bold tabular-nums text-[#c9a227] ${fontHeading}`}>{timeLeft}</div>
                </div>
            </div>

            {/* ═══════ LEFT: STANDINGS ═══════ */}
            <div className="absolute top-24 left-6 z-20 w-80">
                <div className={`mb-3 text-xs font-medium text-[#888] ${fontHeading}`}>Plasman</div>
                <div className="space-y-2">
                    {standings.map((team, i) => {
                        const isLeader = i === 0;
                        return (
                            <div
                                key={team.id}
                                className="flex items-center gap-3 rounded-xl bg-[#060a06]/80 px-4 py-3 backdrop-blur-sm"
                            >
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${fontHeading}`}
                                    style={{
                                        backgroundColor: isLeader ? `${team.color}20` : "transparent",
                                        color: isLeader ? team.color : "#555",
                                    }}
                                >
                                    {i + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className={`truncate text-sm font-semibold text-[#f0f0f0] ${fontHeading}`}>
                                        {team.name}
                                    </div>
                                    <div className="truncate text-[11px] text-[#555]">
                                        {team.players.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-lg font-bold tabular-nums ${fontHeading} ${isLeader ? "text-[#c9a227]" : "text-[#f0f0f0]"}`}>
                                        {formatWeight(team.totalWeight)}
                                    </div>
                                    <div className="text-[10px] text-[#555]">{team.catchesCount} ulova</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══════ RIGHT: LATEST + BIGGEST ═══════ */}
            <div className="absolute top-24 right-6 z-20 w-72 space-y-4">
                {/* Najveći ulov */}
                {biggestCatch && (
                    <div className="rounded-xl bg-[#060a06]/80 p-4 backdrop-blur-sm">
                        <div className={`mb-2 text-xs text-[#666] ${fontHeading}`}>Najveći ulov</div>
                        <div className={`text-3xl font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>
                            {formatWeight(biggestCatch.weight)} <span className="text-base text-[#c9a227]">kg</span>
                        </div>
                        <div className="mt-1 text-sm text-[#ccc]">{formatFishType(biggestCatch.fish_type)}</div>
                        <div className="text-xs text-[#666]">{getTeam(biggestCatch.team_id)?.name}</div>
                    </div>
                )}

                {/* Poslednji ulov */}
                {latestCatch && (
                    <div className="rounded-xl bg-[#060a06]/80 p-4 backdrop-blur-sm">
                        <div className="mb-2 flex items-center gap-2">
                            <span className={`text-xs text-[#666] ${fontHeading}`}>Poslednji ulov</span>
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9a227]" />
                        </div>
                        <div className={`text-2xl font-bold tabular-nums text-[#f0f0f0] ${fontHeading}`}>
                            {formatWeight(latestCatch.weight)} <span className="text-sm text-[#c9a227]">kg</span>
                        </div>
                        <div className="mt-1 text-sm text-[#ccc]">{formatFishType(latestCatch.fish_type)}</div>
                        <div className="text-xs text-[#666]">
                            {getTeam(latestCatch.team_id)?.name} · {formatTimeShort(latestCatch.caught_at)}
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════ BOTTOM: RECENT CATCHES TICKER ═══════ */}
            {catches.length > 0 && (
                <div className="absolute bottom-6 left-6 right-6 z-20">
                    <div className="flex items-center gap-4 overflow-hidden rounded-xl bg-[#060a06]/80 px-5 py-3 backdrop-blur-sm">
                        <span className={`shrink-0 text-xs font-medium text-[#7cb87c] ${fontHeading}`}>Ulovi:</span>
                        <div className="flex gap-6 overflow-hidden">
                            {catches.slice(0, 8).map((c) => (
                                <div key={c.id} className="flex shrink-0 items-center gap-2 text-sm">
                                    <span className="font-medium text-[#f0f0f0]">{getTeam(c.team_id)?.name}</span>
                                    <span className="text-[#555]">·</span>
                                    <span className="text-[#ccc]">{formatFishType(c.fish_type)}</span>
                                    <span className={`font-bold tabular-nums text-[#c9a227] ${fontHeading}`}>
                                        {formatWeight(c.weight)} kg
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}