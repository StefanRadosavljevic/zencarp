"use client";

import { useEffect, useState } from "react";
import { pb, fishTypeLabels, type FishType } from "@/lib/pocketbase";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";

// ══ Isti fontovi kao na landing i pravilniku ══
const fontHeading = "font-[family-name:var(--font-poppins)]";
const fontBody = "font-[family-name:var(--font-inter)]";

const FISH_IMAGES: Record<FishType, string> = {
    common_carp: "/common_carp.png",
    mirror_carp: "/mirror_carp.png",
    grass_carp: "/grass_carp.png",
};

const PARTNER_LOGOS = Array.from({ length: 10 }, (_, i) => `/logos/logo${i + 1}.svg`);

type Tournament = {
    id: string;
    name: string;
    status: "upcoming" | "in_progress" | "completed";
    starts_at: string | null;
    ends_at: string | null;
};

type Team = {
    id: string;
    name: string;
    tournament_id: string;
};

type Player = {
    id: string;
    team_id: string;
    first_name: string;
    last_name: string;
    age: number;
};

type Catch = {
    id: string;
    tournament_id: string;
    team_id: string;
    fish_type: FishType;
    weight: number;
    caught_at: string;
};

type TeamStanding = Team & {
    players: Player[];
    totalWeight: number;
    catchesCount: number;
};

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
    const now = Date.now();
    const then = new Date(date).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 30) return "Upravo sada";
    if (diffSec < 60) return `pre ${diffSec}s`;
    if (diffMin < 60) return `pre ${diffMin} min`;
    if (diffHour < 24) return `pre ${diffHour}h ${diffMin % 60}min`;
    return formatTime(date);
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.2 },
    },
} as const;

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 300, damping: 24 } as const,
    },
} as const;

const headerVariants = {
    hidden: { opacity: 0, y: -20, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 300, damping: 25, delay: 0.1 } as const,
    },
} as const;

const rowVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i: number) => ({
        opacity: 1,
        x: 0,
        transition: { delay: i * 0.06, type: "spring", stiffness: 350, damping: 22 } as const,
    }),
    exit: { opacity: 0, x: -30, scale: 0.95 },
} as const;

export default function ResultsPage() {
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [catches, setCatches] = useState<Catch[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState<string>("--:--:--");
    const [, setTick] = useState(0);
    const [mounted, setMounted] = useState(false);

    // Tick every 15s to refresh relative times
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 15000);
        return () => clearInterval(id);
    }, []);

    // Load data
    useEffect(() => {
        async function loadData() {
            try {
                // 1. Get the latest tournament
                const tournamentRes = await pb.collection("tournaments").getList<Tournament>(1, 1, {
                    sort: "-created",
                });

                if (tournamentRes.items.length === 0) {
                    setLoading(false);
                    return;
                }

                const tournamentData = tournamentRes.items[0];
                setTournament(tournamentData);

                // 2. Get catches for this tournament
                const catchesRes = await pb.collection("catches").getFullList<Catch>({
                    filter: `tournament_id = "${tournamentData.id}"`,
                    sort: "-caught_at",
                });
                setCatches(catchesRes);

                // 3. Get teams - try by tournament_id first, if empty fallback to team ids from catches
                let teamsRes = await pb.collection("teams").getFullList<Team>({
                    filter: `tournament_id = "${tournamentData.id}"`,
                });

                // If no teams found via tournament_id, extract team_ids from catches
                if (teamsRes.length === 0 && catchesRes.length > 0) {
                    const teamIds = [...new Set(catchesRes.map((c) => c.team_id))];
                    if (teamIds.length > 0) {
                        const teamFilter = teamIds.map((id) => `id = "${id}"`).join(" || ");
                        teamsRes = await pb.collection("teams").getFullList<Team>({
                            filter: teamFilter,
                        });
                    }
                }
                setTeams(teamsRes);

                // 4. Get players for all teams (using team_id, NOT tournament_id)
                if (teamsRes.length > 0) {
                    const teamIds = teamsRes.map((t) => t.id);
                    const playersFilter = teamIds.map((id) => `team_id = "${id}"`).join(" || ");
                    const playersRes = await pb.collection("players").getFullList<Player>({
                        filter: playersFilter,
                    });
                    setPlayers(playersRes);
                } else {
                    setPlayers([]);
                }
            } catch (err) {
                console.error("Greška pri učitavanju:", err);
            } finally {
                setLoading(false);
                setMounted(true);
            }
        }

        loadData();
    }, []);

    // PocketBase real-time subscriptions
    useEffect(() => {
        if (!tournament) return;

        const tournamentId = tournament.id;

        let unsubCatches: (() => void) | null = null;
        let unsubTournament: (() => void) | null = null;

        async function subscribe() {
            // Subscribe to catches
            unsubCatches = await pb.collection("catches").subscribe<Catch>("*", (e) => {
                if (e.action === "create") {
                    setCatches((prev) => [e.record, ...prev]);
                } else if (e.action === "delete") {
                    setCatches((prev) => prev.filter((c) => c.id !== e.record.id));
                } else if (e.action === "update") {
                    setCatches((prev) => prev.map((c) => (c.id === e.record.id ? e.record : c)));
                }
            });

            // Subscribe to tournament updates
            unsubTournament = await pb.collection("tournaments").subscribe<Tournament>(
                tournamentId,
                (e) => {
                    if (e.action === "update") {
                        setTournament(e.record);
                    }
                }
            );
        }

        subscribe();

        return () => {
            unsubCatches?.();
            unsubTournament?.();
        };
    }, [tournament]);

    // Countdown timer
    useEffect(() => {
        if (!tournament?.ends_at) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(tournament.ends_at!).getTime();
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft("00:00:00");
                clearInterval(interval);
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setTimeLeft(
                `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [tournament]);

    // Compute standings – only if teams and players are loaded
    const standings: TeamStanding[] = teams
        .map((team) => {
            const teamCatches = catches.filter((c) => c.team_id === team.id);
            const totalWeight = teamCatches.reduce((sum, c) => sum + c.weight, 0);
            const teamPlayers = players.filter((p) => p.team_id === team.id);

            return {
                ...team,
                players: teamPlayers,
                totalWeight,
                catchesCount: teamCatches.length,
            };
        })
        .sort((a, b) => b.totalWeight - a.totalWeight);

    const topCatches = [...catches].sort((a, b) => b.weight - a.weight).slice(0, 5);
    const biggestCatch = topCatches[0] || null;
    const latestCatches = catches.slice(0, 20);

    const getTeam = (teamId: string) => teams.find((t) => t.id === teamId) || null;
    const getTeamPlayers = (teamId: string) => players.filter((p) => p.team_id === teamId);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#060a06]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="text-center"
                >
                    <motion.div
                        className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-[#1a2e1a] border-t-[#c9a227]"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <p className={`text-sm text-[#aaa] ${fontBody}`}>Učitavanje rezultata...</p>
                </motion.div>
            </div>
        );
    }

    if (!tournament) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#060a06] px-5">
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-lg text-[#aaa] ${fontBody}`}
                >
                    Trenutno nema aktivnog turnira.
                </motion.p>
            </div>
        );
    }

    return (
        <>
            <div className={`min-h-screen bg-[#060a06] ${fontBody} text-[#e8e8e8] selection:bg-[#c9a227] selection:text-black pb-20`}>
                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                    {/* HEADER */}
                    <motion.header
                        variants={headerVariants}
                        initial="hidden"
                        animate={mounted ? "visible" : "hidden"}
                        className="mb-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/80 px-6 py-4 backdrop-blur-md sm:flex-row sm:items-center"
                    >
                        <div className="flex items-center gap-4">
                            <motion.img
                                src="/zencarp_logo.png"
                                alt="ZenCarp"
                                className="h-11 w-auto"
                                whileHover={{ scale: 1.05, rotate: -2 }}
                                transition={{ type: "spring", stiffness: 400 }}
                            />
                            <div>
                                <div className="mb-0.5 flex items-center gap-2.5">
                                    <motion.span
                                        className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400 border border-red-500/20"
                                        animate={{ opacity: [1, 0.7, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    >
                                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                        {tournament.status === "in_progress" ? "Uživo" : tournament.status === "completed" ? "Završeno" : "Uskoro"}
                                    </motion.span>
                                    <span className="text-xs text-[#666]">•</span>
                                    <span className="text-xs font-medium text-[#888]">{tournament.name}</span>
                                </div>
                                <motion.h1
                                    className={`text-2xl font-extrabold text-[#f0f0f0] sm:text-3xl ${fontHeading}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    Rezultati uživo
                                </motion.h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <motion.div
                                className="flex items-center gap-3 rounded-full bg-[#0a140a] px-4 py-1.5 border border-[#1a2e1a]"
                                whileHover={{ scale: 1.02 }}
                                transition={{ type: "spring", stiffness: 400 }}
                            >
                                <span className={`text-xs font-bold uppercase tracking-wider text-[#7cb87c] ${fontHeading}`}>
                                    Preostalo
                                </span>
                                <motion.span
                                    className={`text-xl font-extrabold tabular-nums text-[#c9a227] ${fontHeading}`}
                                    key={timeLeft}
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 0.5 }}
                                >
                                    {timeLeft}
                                </motion.span>
                            </motion.div>
                            <div className="hidden items-center gap-1.5 text-xs text-[#aaa] border-l border-[#1a2e1a] pl-3 sm:flex">
                                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[#9db8d8]">
                                    <path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 9.06 4 4 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                                </svg>
                                <span className="font-bold tabular-nums">22°C</span>
                            </div>
                        </div>
                    </motion.header>

                    {/* Glavni sadržaj */}
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate={mounted ? "visible" : "hidden"}
                        className="grid gap-6 lg:grid-cols-5 lg:items-stretch"
                    >
                        {/* Plasman */}
                        <motion.div variants={itemVariants} className="lg:col-span-3">
                            <div className="border-b border-[#1a2e1a]/60 pb-4">
                                <motion.h2
                                    className={`mb-5 text-lg font-extrabold text-[#f0f0f0] ${fontHeading}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 }}
                                >
                                    Plasman
                                </motion.h2>
                                {standings.length === 0 ? (
                                    <p className="text-sm text-[#666]">Još nema rezultata.</p>
                                ) : (
                                    <LayoutGroup>
                                        <motion.div className="space-y-3" layout>
                                            <AnimatePresence mode="popLayout">
                                                {standings.map((team, index) => {
                                                    const position = index + 1;
                                                    const posColor = position === 1 ? "text-[#c9a227]" : position === 2 ? "text-[#b8b8b8]" : position === 3 ? "text-[#cd7f32]" : "text-[#666]";
                                                    return (
                                                        <motion.div
                                                            key={team.id}
                                                            layout
                                                            custom={index}
                                                            variants={rowVariants}
                                                            initial="hidden"
                                                            animate="visible"
                                                            exit="exit"
                                                            whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.03)" }}
                                                            className="flex items-center gap-4 border-b border-[#1a2e1a]/30 py-3 transition-colors hover:border-[#c9a227]/30"
                                                        >
                                                            <motion.div
                                                                className={`w-8 text-2xl font-extrabold ${posColor} ${fontHeading}`}
                                                                animate={{ scale: [1, 1.2, 1] }}
                                                                transition={{ duration: 0.4, delay: index * 0.02 }}
                                                            >
                                                                {position}
                                                            </motion.div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className={`mb-0.5 text-base font-bold text-[#f0f0f0] ${fontHeading}`}>{team.name}</div>
                                                                <div className="text-xs text-[#888]">{team.players.map(p => `${p.first_name} ${p.last_name}`).join(" · ")}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <motion.div
                                                                    className={`text-lg font-extrabold tabular-nums text-[#f0f0f0] ${fontHeading}`}
                                                                    key={`weight-${team.id}-${team.totalWeight}`}
                                                                    animate={{ scale: [1, 1.1, 1] }}
                                                                    transition={{ duration: 0.4 }}
                                                                >
                                                                    {formatWeight(team.totalWeight)} <span className="text-xs text-[#666]">kg</span>
                                                                </motion.div>
                                                                <motion.div
                                                                    className="text-xs text-[#666]"
                                                                    key={`count-${team.id}-${team.catchesCount}`}
                                                                    animate={{ scale: [1, 1.2, 1] }}
                                                                    transition={{ duration: 0.3 }}
                                                                >
                                                                    {team.catchesCount} ulova
                                                                </motion.div>
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </motion.div>
                                    </LayoutGroup>
                                )}
                            </div>
                        </motion.div>

                        {/* Najveći ulov */}
                        <motion.div variants={itemVariants} className="lg:col-span-2">
                            {biggestCatch ? (
                                <motion.div
                                    className="border border-[#c9a227]/20 rounded-xl overflow-hidden bg-[#0d140d]/60"
                                    whileHover={{ scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300 }}
                                >
                                    <div className="relative bg-[#0a140a]">
                                        <motion.img
                                            src={FISH_IMAGES[biggestCatch.fish_type]}
                                            alt={formatFishType(biggestCatch.fish_type)}
                                            className="h-auto w-full"
                                            style={{ aspectRatio: "1672/941", objectFit: "contain" }}
                                            onError={(e) => (e.target as HTMLImageElement).src = FISH_IMAGES.common_carp}
                                            initial={{ scale: 1.05 }}
                                            animate={{ scale: 1 }}
                                            transition={{ duration: 0.6 }}
                                        />
                                        <div className="absolute inset-0 bg-linear-to-t from-[#0d140d] via-transparent to-transparent" />
                                        <div className="absolute bottom-3 left-4">
                                            <div className={`text-xs font-bold uppercase tracking-widest text-[#c9a227] ${fontHeading}`}>Najveći ulov</div>
                                        </div>
                                    </div>
                                    <div className="p-5">
                                        <motion.div
                                            className={`mb-1 text-4xl font-extrabold tabular-nums text-[#f0f0f0] ${fontHeading}`}
                                            key={biggestCatch.id}
                                            animate={{ scale: [1, 1.05, 1] }}
                                            transition={{ duration: 0.5 }}
                                        >
                                            {formatWeight(biggestCatch.weight)} <span className="text-xl text-[#c9a227]/70">kg</span>
                                        </motion.div>
                                        <div className="mb-1 text-base font-bold text-[#e0e0e0]">{formatFishType(biggestCatch.fish_type)}</div>
                                        <div className="text-sm text-[#aaa]">{getTeam(biggestCatch.team_id)?.name}</div>
                                        <div className="mt-2 text-xs text-[#777]">{formatTime(biggestCatch.caught_at)} · {timeAgo(biggestCatch.caught_at)}</div>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="border border-[#1a2e1a] rounded-xl p-6 text-center text-[#666]">Još nema ulova.</div>
                            )}
                        </motion.div>
                    </motion.div>

                    {/* Top 5 i timeline */}
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate={mounted ? "visible" : "hidden"}
                        className="mt-8 grid gap-6 lg:grid-cols-5 lg:items-start"
                    >
                        {/* Top 5 */}
                        <motion.div variants={itemVariants} className="lg:col-span-2">
                            <h2 className={`mb-4 text-lg font-extrabold text-[#f0f0f0] ${fontHeading}`}>Top 5 ulova</h2>
                            {topCatches.length === 0 ? (
                                <p className="text-sm text-[#666]">Još nema ulova.</p>
                            ) : (
                                <div className="space-y-2">
                                    {topCatches.map((c, i) => {
                                        const team = getTeam(c.team_id);
                                        return (
                                            <motion.div
                                                key={c.id}
                                                variants={rowVariants}
                                                custom={i}
                                                initial="hidden"
                                                animate="visible"
                                                whileHover={{ scale: 1.01 }}
                                                className="flex items-center gap-3 border-b border-[#1a2e1a]/30 py-2"
                                            >
                                                <div className={`flex h-8 w-8 items-center justify-center text-sm font-extrabold text-[#c9a227] ${fontHeading}`}>#{i + 1}</div>
                                                <div className="h-10 w-16 overflow-hidden rounded bg-[#0a140a]">
                                                    <img src={FISH_IMAGES[c.fish_type]} alt={formatFishType(c.fish_type)} className="h-full w-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = FISH_IMAGES.common_carp} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-[#e0e0e0]">{formatFishType(c.fish_type)}</div>
                                                    <div className="truncate text-xs text-[#777]">{team?.name || "Nepoznat tim"}</div>
                                                </div>
                                                <motion.div
                                                    className={`shrink-0 text-base font-extrabold tabular-nums text-[#f0f0f0] ${fontHeading}`}
                                                    key={c.id}
                                                    animate={{ scale: [1, 1.05, 1] }}
                                                    transition={{ duration: 0.3 }}
                                                >
                                                    {formatWeight(c.weight)} <span className="text-xs text-[#666]">kg</span>
                                                </motion.div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>

                        {/* Timeline */}
                        <motion.div variants={itemVariants} className="lg:col-span-3">
                            <h2 className={`mb-4 text-lg font-extrabold text-[#f0f0f0] ${fontHeading}`}>Poslednjih 20 ulova</h2>
                            {latestCatches.length === 0 ? (
                                <p className="text-sm text-[#666]">Još nema ulova.</p>
                            ) : (
                                <div className="relative max-h-150 overflow-y-auto pr-1">
                                    <div className="absolute bottom-0 left-1.75 top-0 w-px bg-[#1a2e1a]" />
                                    <div className="space-y-2.5">
                                        <AnimatePresence mode="popLayout">
                                            {latestCatches.map((c, idx) => {
                                                const team = getTeam(c.team_id);
                                                const players = getTeamPlayers(c.team_id);
                                                const isNewest = idx === 0;
                                                return (
                                                    <motion.div
                                                        key={c.id}
                                                        layout
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: 20 }}
                                                        transition={{ delay: idx * 0.03, type: "spring", stiffness: 300, damping: 25 }}
                                                        className="relative flex gap-3 pl-3"
                                                    >
                                                        <div className="relative z-10 flex items-center">
                                                            <motion.div
                                                                className={`h-3 w-3 rounded-full border-2 border-[#0d140d] ${isNewest ? "bg-[#c9a227]" : "bg-[#7cb87c]"}`}
                                                                animate={isNewest ? { scale: [1, 1.4, 1] } : {}}
                                                                transition={{ duration: 0.6, repeat: isNewest ? 3 : 0 }}
                                                            />
                                                        </div>
                                                        <div className={`flex flex-1 items-center gap-3 border ${isNewest ? "border-[#c9a227]/40 bg-[#c9a227]/5" : "border-[#1a2e1a]/30 bg-[#060a06]/40"} rounded-xl p-3 transition-colors hover:border-[#c9a227]/20`}>
                                                            <div className="h-11 w-16 overflow-hidden rounded bg-[#0a140a]">
                                                                <img src={FISH_IMAGES[c.fish_type]} alt={formatFishType(c.fish_type)} className="h-full w-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = FISH_IMAGES.common_carp} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-baseline gap-2">
                                                                    <span className={`text-sm font-bold ${fontHeading} ${isNewest ? "text-[#f0f0f0]" : "text-[#e0e0e0]"}`}>{team?.name || "Nepoznat tim"}</span>
                                                                    {isNewest && <span className={`rounded-full bg-[#c9a227]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#c9a227] ${fontHeading}`}>Novo</span>}
                                                                </div>
                                                                <div className="mt-0.5 text-xs text-[#999]">{players.map(p => `${p.first_name} ${p.last_name}`).join(" · ")}</div>
                                                                <div className="mt-1 inline-flex items-center rounded-md bg-[#111a11] px-1.5 py-0.5 text-xs text-[#7cb87c]">{formatFishType(c.fish_type)}</div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-0.5">
                                                                <motion.div
                                                                    className={`text-base font-extrabold tabular-nums ${isNewest ? "text-[#c9a227]" : "text-[#f0f0f0]"} ${fontHeading}`}
                                                                    key={c.id}
                                                                    animate={{ scale: [1, 1.05, 1] }}
                                                                    transition={{ duration: 0.3 }}
                                                                >
                                                                    {formatWeight(c.weight)} <span className="text-[10px] text-[#666]">kg</span>
                                                                </motion.div>
                                                                <div className="text-[11px] tabular-nums text-[#666]">{formatTime(c.caught_at)}</div>
                                                                <div className="text-[10px] text-[#555]">{timeAgo(c.caught_at)}</div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>

                    <motion.footer
                        initial={{ opacity: 0 }}
                        animate={{ opacity: mounted ? 1 : 0 }}
                        transition={{ delay: 1.2 }}
                        className="mt-12 border-t border-[#1a2e1a]/60 pt-6 text-center"
                    >
                        <p className="text-xs text-[#444]">© 2026 ZenCarp · Rezultati se osvežavaju automatski</p>
                    </motion.footer>
                </div>
            </div>

            {/* PARTNER STRIP */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.6 }}
                className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
            >
                <div className="w-full max-w-[95%] overflow-hidden rounded-xl border border-[#1a2e1a]/20 bg-[#060a06]/80 py-2 backdrop-blur-sm">
                    <div
                        className="flex items-center gap-8"
                        style={{
                            width: "max-content",
                            animation: "marquee 30s linear infinite",
                        }}
                    >
                        {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, idx) => (
                            <img
                                key={idx}
                                src={src}
                                alt={`Partner ${idx + 1}`}
                                className="h-10 w-auto opacity-80 transition-opacity duration-300 hover:opacity-100"
                            />
                        ))}
                    </div>
                </div>
            </motion.div>

            <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
        </>
    );
}