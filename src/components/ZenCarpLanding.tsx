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

function CloudIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
            <path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 9.06 4 4 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
    );
}
function PlayIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M8 5v14l11-7z" /></svg>; }
function TrophyIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M6 9v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M6 9h12" /><path d="M12 17v3m-3 0h6" /></svg>; }
function MapPinIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>; }
function SmartphoneIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>; }
function EyeIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>; }
function FileTextIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>; }

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
    return <div className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: `all 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s` }}>{children}</div>;
}

export default function ZenCarpLanding() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
                const tournamentRes = await pb.collection("tournaments").getList<Tournament>(1, 1, {
                    sort: "-created",
                });

                if (tournamentRes.items.length === 0) {
                    setLoadingLive(false);
                    return;
                }

                const tournamentData = tournamentRes.items[0];
                setTournament(tournamentData);

                if (tournamentData.status === "in_progress") {
                    // Dohvati ulove
                    const catchesRes = await pb.collection("catches").getFullList<Catch>({
                        filter: `tournament_id = "${tournamentData.id}"`,
                        sort: "-caught_at",
                    });
                    setCatches(catchesRes);

                    // Dohvati timove – prvo preko tournament_id, ako nema, preko ID-jeva iz ulova
                    let teamsRes = await pb.collection("teams").getFullList<Team>({
                        filter: `tournament_id = "${tournamentData.id}"`,
                    });

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

                    // Dohvati igrače za sve timove (preko team_id)
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
                }
            } catch (err) {
                console.error("Greška pri učitavanju live podataka:", err);
            } finally {
                setLoadingLive(false);
            }
        }

        loadLiveData();
    }, []);

    // Real-time subscription za turnir (da se ažurira ends_at, status, itd.)
    useEffect(() => {
        if (!tournament) return;

        const tournamentId = tournament.id;

        let unsubTournament: (() => void) | null = null;

        async function subscribeTournament() {
            unsubTournament = await pb.collection("tournaments").subscribe<Tournament>(
                tournamentId,
                (e) => {
                    if (e.action === "update") {
                        setTournament(e.record);
                    }
                }
            );
        }

        subscribeTournament();

        return () => {
            unsubTournament?.();
        };
    }, [tournament]);

    // Računanje preostalog vremena na osnovu ends_at
    useEffect(() => {
        if (!tournament?.ends_at) {
            setTimeLeft("--:--:--");
            return;
        }

        const updateTimeLeft = () => {
            const now = Date.now();
            const end = new Date(tournament.ends_at!).getTime();
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft("00:00:00");
                return;
            }

            // Računamo dane, sate, minute, sekunde
            const totalSeconds = Math.floor(diff / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            // Formatiranje
            if (days > 0) {
                setTimeLeft(
                    `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
                );
            } else {
                setTimeLeft(
                    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
                );
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

    const navLinks = [
        { label: "O turniru", href: "#o-turniru" },
        { label: "Format", href: "#format" },
        { label: "Zašto ZenCarp", href: "#zasto" },
        { label: "Prenos", href: "#prenos" },
        { label: "Aplikacija", href: "#aplikacija" },
        { label: "Partnerstvo", href: "#partnerstvo" },
        { label: "Prijava", href: "#prijava" },
    ];

    return (
        <div className={`min-h-screen bg-[#060a06] ${fontBody} text-[#e8e8e8] selection:bg-[#c9a227] selection:text-black`}>
            <header className="fixed top-0 z-50 w-full border-b border-[#1a2e1a]/60 bg-[#060a06]/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
                    <a href="#" className="flex items-center"><img src={`${import.meta.env.BASE_URL}zencarp_logo.png`} alt="ZenCarp" className="h-11 w-auto" /></a>
                    <nav className="hidden items-center gap-1 md:flex">
                        {navLinks.map(l => <a key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#aaa] transition-colors hover:bg-[#111a11] hover:text-[#f0f0f0]">{l.label}</a>)}
                        <a href={`${import.meta.env.BASE_URL}results`} className={`rounded-lg px-3 py-1.5 text-sm font-bold text-[#c9a227] transition-colors hover:bg-[#c9a227]/10 ${fontHeading}`}>Rezultati</a>
                        <a href={`${import.meta.env.BASE_URL}pravilnik`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#aaa] transition-colors hover:bg-[#111a11] hover:text-[#f0f0f0]">Pravilnik</a>
                        <a href="#prijava" className={`ml-3 rounded-full bg-[#c9a227] px-4 py-1.5 text-sm font-bold text-[#0a0f0a] transition-transform hover:scale-105 ${fontHeading}`}>Prijavi ekipu</a>
                    </nav>
                    <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1a2e1a] text-[#aaa] md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Meni">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{mobileMenuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 8h16M4 16h16" />}</svg>
                    </button>
                </div>
                {mobileMenuOpen && (
                    <div className="border-t border-[#1a2e1a] bg-[#060a06]/95 px-5 pb-4 pt-2 md:hidden">
                        {navLinks.map(l => <a key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-[#aaa] hover:bg-[#111a11] hover:text-[#f0f0f0]">{l.label}</a>)}
                        <a href={`${import.meta.env.BASE_URL}results`} onClick={() => setMobileMenuOpen(false)} className={`block rounded-lg px-3 py-2 text-sm font-bold text-[#c9a227] hover:bg-[#c9a227]/10 ${fontHeading}`}>Rezultati</a>
                        <a href={`${import.meta.env.BASE_URL}pravilnik`} onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-[#aaa] hover:bg-[#111a11] hover:text-[#f0f0f0]">Pravilnik</a>
                    </div>
                )}
            </header>

            <main className="pt-16">
                {loadingLive ? (
                    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-5">
                        <div className="text-center">
                            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-[#1a2e1a] border-t-[#c9a227]" />
                            <p className="text-sm text-[#aaa]">Učitavanje...</p>
                        </div>
                    </section>
                ) : tournament && tournament.status === "in_progress" ? (
                    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-5">
                        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80')" }} />
                        <div className="absolute inset-0 bg-linear-to-b from-[#060a06]/70 via-[#060a06]/50 to-[#060a06]/90" />
                        <div className="absolute inset-0 bg-linear-to-tr from-[#0a140a]/60 via-transparent to-[#c9a227]/10" />

                        <div className="relative z-10 mx-auto max-w-5xl w-full">
                            <FadeIn>
                                <div className="flex flex-col items-start justify-between gap-4 mb-6 sm:flex-row sm:items-center">
                                    <div className="flex items-center gap-4">
                                        <img src={`${import.meta.env.BASE_URL}zencarp_logo.png`} alt="ZenCarp" className="h-12 w-auto" />
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
                            </FadeIn>

                            <FadeIn delay={0.2}>
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
                            </FadeIn>

                            <FadeIn delay={0.4}>
                                <div className="mt-6 text-center">
                                    <a href={`${import.meta.env.BASE_URL}results`} className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[#0a0f0a] shadow-lg shadow-[#c9a227]/20 transition-transform hover:scale-105 ${fontHeading}`}>
                                        <EyeIcon className="h-4 w-4" /> Pogledaj sve rezultate
                                    </a>
                                </div>
                            </FadeIn>
                        </div>
                    </section>
                ) : (
                    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-5">
                        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541742425281-c1d3fc8aff96?auto=format&fit=crop&w=1920&q=80')" }} />
                        <div className="absolute inset-0 bg-linear-to-b from-[#060a06]/70 via-[#060a06]/50 to-[#060a06]/90" />
                        <div className="absolute inset-0 bg-linear-to-tr from-[#0a140a]/60 via-transparent to-[#c9a227]/10" />
                        <div className="relative z-10 mx-auto max-w-4xl text-center">
                            <FadeIn>
                                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1a2e1a] bg-[#0d140d]/80 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#7cb87c] backdrop-blur-sm">
                                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9a227]" /> Prvi ZenCarp turnir — nova ideja, prva probna verzija
                                </div>
                            </FadeIn>
                            <FadeIn delay={0.05}>
                                <img src={`${import.meta.env.BASE_URL}zencarp_logo.png`} alt="ZenCarp" className="mx-auto mb-6 h-40 w-auto drop-shadow-[0_4px_40px_rgba(201,162,39,0.3)] sm:h-52" />
                            </FadeIn>
                            <FadeIn delay={0.2}>
                                <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-[#ddd] sm:text-xl">Četiri ekipe. Četiri sata. Jedno jezero. <br className="hidden sm:block" /> Prenos uživo i rezultati u realnom vremenu — probamo prvi put.</p>
                            </FadeIn>
                            <FadeIn delay={0.3}>
                                <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                                    <a href="#prijava" className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[#0a0f0a] shadow-lg shadow-[#c9a227]/20 transition-transform hover:scale-105 ${fontHeading}`}><TrophyIcon className="h-4 w-4" /> Prijavi ekipu</a>
                                    <a href="#prenos" className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d140d]/60 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-[#e0e0e0] backdrop-blur-sm transition-colors hover:border-[#c9a227]/40 hover:text-[#c9a227] ${fontHeading}`}><PlayIcon className="h-4 w-4" /> Gledaj prenos</a>
                                </div>
                            </FadeIn>
                            <FadeIn delay={0.4}>
                                <div className="inline-flex items-center gap-3 rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/70 px-6 py-4 backdrop-blur-md">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c9a227]/10 text-[#c9a227]"><MapPinIcon className="h-5 w-5" /></div>
                                    <div className="text-left"><div className={`text-xs font-bold uppercase tracking-wider text-[#7cb87c] ${fontHeading}`}>Kada & gde</div><div className="text-sm font-semibold text-[#e0e0e0]">Vojvoda Stepa — Uskoro</div></div>
                                </div>
                            </FadeIn>
                        </div>
                    </section>
                )}

                {/* O turniru */}
                <section id="o-turniru" className="px-5 py-24">
                    <div className="mx-auto max-w-6xl">
                        <div className="grid items-center gap-12 lg:grid-cols-2">
                            <FadeIn>
                                <div>
                                    <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>O turniru</div>
                                    <h2 className={`mb-6 text-3xl font-extrabold leading-tight text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Ideja koju prvi put probamo. <br /><span className="text-[#c9a227]">Bez velikih obećanja.</span></h2>
                                    <div className="space-y-4 text-[15px] leading-relaxed text-[#aaa]">
                                        <p>ZenCarp je pokušaj da se pecanje šarana prikaže drugačije — sa prenosom uživo i rezultatima koji se ažuriraju u realnom vremenu, umesto pasivnog čekanja.</p>
                                        <p>Format: četiri ekipe, četiri sata, snimanje iz vazduha i plasman koji se prati uživo. Ovo nam je prvi pokušaj, pa ćemo tokom dana verovatno učiti i prilagođavati se.</p>
                                        <p>Ako te zanima da vidiš kako to izgleda u praksi — pridruži se ili prati prenos.</p>
                                    </div>
                                </div>
                            </FadeIn>
                            <FadeIn delay={0.15}>
                                <div className="relative">
                                    <div className="absolute -inset-3 rounded-4xl bg-linear-to-br from-[#c9a227]/10 via-transparent to-[#7cb87c]/10 blur-xl" />
                                    <div className="relative overflow-hidden rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/90 p-3 shadow-2xl">
                                        <img src={`${import.meta.env.BASE_URL}mapa_jezera.png`} alt="Mapa jezera sa pozicijama ekipa i ulazom za publiku" className="h-auto w-full rounded-xl" style={{ objectFit: "contain" }} />
                                    </div>
                                </div>
                            </FadeIn>
                        </div>
                    </div>
                </section>

                {/* Format */}
                <section id="format" className="border-y border-[#1a2e1a]/40 bg-[#080c08] px-5 py-24">
                    <div className="mx-auto max-w-4xl">
                        <FadeIn>
                            <div className="mb-12 text-center">
                                <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Format takmičenja</div>
                                <h2 className={`text-3xl font-extrabold text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Pravila ukratko</h2>
                            </div>
                        </FadeIn>
                        <div className="grid gap-x-16 gap-y-8 md:grid-cols-2">
                            {[{ title: "4 ekipe", text: "Dva takmičara po ekipi. Žreb određuje pozicije na dan turnira." }, { title: "4 pozicije", text: "Svaka ekipa dobija peg na jezeru — pozicije se određuju žrebom." }, { title: "Trajanje: 4 sata", text: "17:00 — 21:00." }, { title: "Oprema", text: "2 rodpoda (4 štapa) po takmičaru. Isti uslovi za sve." }, { title: "Ciljane vrste", text: "Šaran i amur. Ostale vrste se ne računaju u ukupan ulov." }, { title: "Catch & Release", text: "Svaka riba se izmeri, fotografiše i vrati u jezero." }, { title: "Plasman", text: "Odlučuje ukupna težina ulova (kg)." }, { title: "Nagrada", text: "Nagradni fond je 200 EUR i ide isključivo prvoplasiranoj ekipi. Pobednik nosi sve." }].map((item, i) => (
                                <FadeIn key={item.title} delay={i * 0.05}>
                                    <div className="group flex gap-4 border-b border-[#1a2e1a]/30 pb-3">
                                        <span className={`mt-0.5 text-lg font-extrabold text-[#c9a227]/60 transition-colors group-hover:text-[#c9a227] ${fontHeading}`}>{String(i + 1).padStart(2, "0")}</span>
                                        <div><h3 className={`mb-1 text-sm font-bold text-[#e0e0e0] ${fontHeading}`}>{item.title}</h3><p className="text-sm leading-relaxed text-[#777]">{item.text}</p></div>
                                    </div>
                                </FadeIn>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Zašto */}
                <section id="zasto" className="px-5 py-24">
                    <div className="mx-auto max-w-6xl">
                        <FadeIn>
                            <div className="mb-12 text-center">
                                <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Zašto je ZenCarp drugačiji</div>
                                <h2 className={`text-3xl font-extrabold text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Šta smo dodali u odnosu na klasičan turnir</h2>
                            </div>
                        </FadeIn>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {[{ icon: <PlayIcon className="h-6 w-6" />, title: "Prenos uživo sa više uglova", desc: "Dve statične kamere za stabilan pregled i dron za snimke iz vazduha." }, { icon: <SmartphoneIcon className="h-6 w-6" />, title: "Rezultati u realnom vremenu", desc: "Plasman se ažurira tokom turnira, bez čekanja na kraj." }, { icon: <CloudIcon className="h-6 w-6" />, title: "Dron pri svakom ulovu", desc: "Pogled iz vazduha kada ekipa izvlači ribu." }, { icon: <TrophyIcon className="h-6 w-6" />, title: "Kompaktan format", desc: "4 sata — lako za ispraćaj od početka do kraja." }, { icon: <MapPinIcon className="h-6 w-6" />, title: "Besplatan ulaz", desc: "Dođi na Vojvodu Stepu i prisustvuj turniru uživo. Parking obezbeđen." }, { icon: <EyeIcon className="h-6 w-6" />, title: "Web aplikacija za praćenje", desc: "Prati rezultate na telefonu u realnom vremenu." }].map((f, i) => (
                                <FadeIn key={f.title} delay={i * 0.08}>
                                    <div className="group border-b border-[#1a2e1a]/30 pb-4 hover:border-[#c9a227]/30 transition-colors">
                                        <div className="mb-2 inline-flex rounded-full bg-[#c9a227]/10 p-2 text-[#c9a227] group-hover:bg-[#c9a227]/20">{f.icon}</div>
                                        <h3 className={`mb-1 text-base font-extrabold text-[#f0f0f0] ${fontHeading}`}>{f.title}</h3>
                                        <p className="text-sm leading-relaxed text-[#888]">{f.desc}</p>
                                    </div>
                                </FadeIn>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Vizuelni identitet */}
                <section className="border-y border-[#1a2e1a]/40 bg-[#080c08] px-5 py-24">
                    <div className="mx-auto max-w-6xl">
                        <div className="grid items-center gap-12 lg:grid-cols-2">
                            <FadeIn>
                                <div>
                                    <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Grafika prenosa</div>
                                    <h2 className={`mb-6 text-3xl font-extrabold leading-tight text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Šta se vidi na ekranu tokom prenosa</h2>
                                    <p className="mb-4 text-[15px] leading-relaxed text-[#aaa]">Tokom prenosa je vidljiv overlay sa tabelom plasmana, preostalim vremenom, vremenskim prilikama i animacijom pri svakom novom ulovu.</p>
                                    <p className="text-[15px] leading-relaxed text-[#aaa]">Uz to, prikazana je mapa jezera sa pozicijama ekipa, timeline ulova i podaci o najvećoj ulovljenoj ribi.</p>
                                </div>
                            </FadeIn>
                            <FadeIn delay={0.15}>
                              <div className="relative">
                                <div className="absolute -inset-3 rounded-4xl bg-linear-to-br from-[#c9a227]/10 via-transparent to-[#7cb87c]/10 blur-xl" />
                                <div className="relative overflow-hidden rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/90 p-4 shadow-2xl">
                                  <img
                                    src={`${import.meta.env.BASE_URL}overlay_preview.png`}
                                    alt="Broadcast overlay preview"
                                    className="h-auto w-full rounded-xl"
                                    style={{ aspectRatio: "16/9", objectFit: "contain" }}
                                  />
                                </div>
                              </div>
                            </FadeIn>
                        </div>
                    </div>
                </section>

                {/* Web aplikacija */}
                <section id="aplikacija" className="px-5 py-24">
                    <div className="mx-auto max-w-6xl">
                        <div className="grid items-center gap-12 lg:grid-cols-2">
                            <FadeIn delay={0.15}>
                                <div className="relative order-2 lg:order-1">
                                    <div className="absolute -inset-3 rounded-4xl bg-linear-to-br from-[#7cb87c]/10 via-transparent to-[#c9a227]/10 blur-xl" />
                                    <div className="relative overflow-hidden rounded-2xl border border-[#1a2e1a] bg-[#0d140d]/90 p-4 shadow-2xl">
                                        <img src={`${import.meta.env.BASE_URL}results_mobile.png`} alt="ZenCarp web aplikacija" className="h-auto w-full rounded-xl" style={{ objectFit: "contain" }} />
                                    </div>
                                </div>
                            </FadeIn>
                            <FadeIn className="order-1 lg:order-2">
                                <div>
                                    <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Web aplikacija</div>
                                    <h2 className={`mb-6 text-3xl font-extrabold leading-tight text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Rezultati na telefonu</h2>
                                    <div className="space-y-4 text-[15px] leading-relaxed text-[#aaa]">
                                        <p>Pored prenosa, napravili smo web aplikaciju koja prati plasman ekipa, statistiku i istoriju ulova u realnom vremenu.</p>
                                        <p>Otvara se u pretraživaču na telefonu ili računaru, ažurira se automatski, bez potrebe za refresh.</p>
                                        <p>Napravljena je isključivo za ovaj turnir — bez dodatnih funkcija koje ne trebaju.</p>
                                    </div>
                                    <div className="mt-8 flex flex-wrap gap-3">
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1a2e1a] bg-[#111a11] px-3 py-1.5 text-xs font-medium text-[#999]"><SmartphoneIcon className="h-3.5 w-3.5 text-[#7cb87c]" /> Mobile-first</span>
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1a2e1a] bg-[#111a11] px-3 py-1.5 text-xs font-medium text-[#999]"><EyeIcon className="h-3.5 w-3.5 text-[#7cb87c]" /> Live rezultati</span>
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1a2e1a] bg-[#111a11] px-3 py-1.5 text-xs font-medium text-[#999]"><CloudIcon className="h-3.5 w-3.5 text-[#7cb87c]" /> Bez refresha</span>
                                    </div>
                                </div>
                            </FadeIn>
                        </div>
                    </div>
                </section>

                {/* Pratite turnir */}
                <section id="prenos" className="border-y border-[#1a2e1a]/40 bg-[#080c08] px-5 py-24">
                    <div className="mx-auto max-w-6xl">
                        <FadeIn>
                            <div className="mb-12 text-center">
                                <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Pratite turnir</div>
                                <h2 className={`text-3xl font-extrabold text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Tri načina da pratite dešavanja</h2>
                            </div>
                        </FadeIn>
                        <div className="grid gap-6 md:grid-cols-3">
                            {[{ icon: <PlayIcon className="h-6 w-6" />, title: "YouTube prenos uživo", desc: "Ceo turnir sa grafikom i tabelom plasmana. Gledaj sa televizora, telefona ili laptopa.", color: "red-500", label: "Link uskoro" }, { icon: <SmartphoneIcon className="h-6 w-6" />, title: "Web aplikacija", desc: "Plasman ekipa uživo na telefonu ili računaru, sa automatskim osvežavanjem.", color: "c9a227", label: "Uskoro dostupno" }, { icon: <MapPinIcon className="h-6 w-6" />, title: "Uživo na jezeru", desc: "Dođi na Vojvodu Stepu i prisustvuj turniru. Ulaz besplatan, parking obezbeđen.", color: "7cb87c", label: "Slobodan ulaz" }].map((item, i) => (
                                <FadeIn key={item.title} delay={i * 0.05}>
                                    <div className="border-b border-[#1a2e1a]/30 pb-4 hover:border-[#c9a227]/30 transition-colors">
                                        <div className={`mb-2 inline-flex rounded-full bg-${item.color}/10 p-2 text-${item.color}`}>{item.icon}</div>
                                        <h3 className={`mb-1 text-lg font-extrabold text-[#f0f0f0] ${fontHeading}`}>{item.title}</h3>
                                        <p className="mb-3 text-sm leading-relaxed text-[#888]">{item.desc}</p>
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#555] ${fontHeading}`}><span className={`inline-block h-1.5 w-1.5 rounded-full bg-${item.color}`} /> {item.label}</span>
                                    </div>
                                </FadeIn>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Partnerstvo */}
                <section id="partnerstvo" className="border-y border-[#1a2e1a]/40 bg-[#080c08] px-5 py-24">
                    <div className="mx-auto max-w-4xl text-center">
                        <FadeIn>
                            <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Partnerstvo</div>
                            <h2 className={`mb-6 text-3xl font-extrabold text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Tražimo lokalne biznise za prvi ZenCarp turnir</h2>
                            <p className="mx-auto mb-10 max-w-2xl text-[15px] leading-relaxed text-[#aaa]">Ovo nam je prvi put da ovo organizujemo, pa nam znači svaka podrška. Bez velikih sponzorskih paketa — poštena saradnja i konkretna vrednost zauzvrat.</p>
                        </FadeIn>
                        <FadeIn delay={0.1}>
                            <div className="relative mx-auto max-w-lg overflow-hidden rounded-3xl border border-[#c9a227]/30 bg-linear-to-b from-[#c9a227]/10 to-[#0d140d]/90 p-8 backdrop-blur-md">
                                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#c9a227]/10 blur-2xl" />
                                <div className="relative">
                                    <div className={`mb-6 text-xs font-bold uppercase tracking-widest text-[#c9a227] ${fontHeading}`}>Šta dobijaš kao partner</div>
                                    <ul className="mb-8 space-y-3 text-left">
                                        {[
                                            "Logo na sponzorskoj traci koja je prikazana tokom celog live prenosa",
                                            "Logo na sponzorskoj traci u web aplikaciji sa rezultatima uživo",
                                            "Kratak video (10–15s) snimljen dronom, sa vašim logom",
                                            "Pomen u završnoj objavi zahvalnica"
                                        ].map(item => (
                                            <li key={item} className="flex items-start gap-3 text-sm text-[#ccc]">
                                                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" /> {item}
                                            </li>
                                        ))}
                                    </ul>
                                    <a href="mailto:partnerstvo@zencarp.rs" className={`inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a227] px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-[#0a0f0a] transition-transform hover:scale-105 ${fontHeading}`}>Kontaktiraj nas</a>
                                    <p className="mt-3 text-xs text-[#555]">partnerstvo@zencarp.rs</p>
                                </div>
                            </div>
                        </FadeIn>
                    </div>
                </section>

                {/* Prijava */}
                <section id="prijava" className="relative overflow-hidden px-5 py-24">
                    <div className="pointer-events-none absolute inset-0"><div className="absolute left-1/2 top-1/2 h-125 w-125 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c9a227]/5 blur-[120px]" /></div>
                    <div className="relative mx-auto max-w-3xl text-center">
                        <FadeIn>
                            <div className={`mb-3 text-xs font-bold uppercase tracking-widest text-[#7cb87c] ${fontHeading}`}>Prijava ekipa</div>
                            <h2 className={`mb-6 text-3xl font-extrabold text-[#f0f0f0] sm:text-4xl ${fontHeading}`}>Prijava ekipa</h2>
                        </FadeIn>
                        <FadeIn delay={0.1}>
                            <div className="mb-10 grid gap-4 sm:grid-cols-2">
                                {[{ label: "Kotizacija", value: "50 EUR / ekipa" }, { label: "Nagrada", value: "200 EUR — pobednik nosi sve" }].map(item => (
                                    <div key={item.label} className="border border-[#1a2e1a] bg-[#0d140d]/70 p-4 rounded-xl backdrop-blur-sm">
                                        <div className={`mb-1 text-xs uppercase tracking-wider text-[#555] ${fontHeading}`}>{item.label}</div>
                                        <div className={`text-sm font-extrabold text-[#f0f0f0] ${fontHeading}`}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                        </FadeIn>
                        <FadeIn delay={0.2}>
                            <p className="mb-8 text-[15px] leading-relaxed text-[#aaa]">Detaljan pravilnik je dostupan ispod.</p>
                            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                                <a href="mailto:prijava@zencarp.rs" className={`inline-flex items-center gap-2 rounded-full bg-[#c9a227] px-8 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[#0a0f0a] shadow-lg shadow-[#c9a227]/20 transition-transform hover:scale-105 ${fontHeading}`}><TrophyIcon className="h-4 w-4" /> Prijavi ekipu</a>
                                <a href={`${import.meta.env.BASE_URL}pravilnik`} className={`inline-flex items-center gap-2 rounded-full border border-[#1a2e1a] bg-[#0d140d]/60 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-[#e0e0e0] backdrop-blur-sm transition-colors hover:border-[#c9a227]/40 hover:text-[#c9a227] ${fontHeading}`}><FileTextIcon className="h-4 w-4" /> Pravilnik</a>
                            </div>
                        </FadeIn>
                    </div>
                </section>
            </main>

            <footer className="border-t border-[#1a2e1a]/60 bg-[#060a06] px-5 py-10">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}zencarp_logo.png`} alt="ZenCarp" className="h-8 w-auto" /></div>
                    <p className="text-xs text-[#444]">© 2026 ZenCarp. Sva prava zadržana.</p>
                    <div className="flex gap-4">
                        <a href="#" className="text-xs text-[#555] transition-colors hover:text-[#c9a227]">Instagram</a>
                        <a href="#" className="text-xs text-[#555] transition-colors hover:text-[#c9a227]">YouTube</a>
                        <a href={`${import.meta.env.BASE_URL}pravilnik`} className="text-xs text-[#555] transition-colors hover:text-[#c9a227]">Pravilnik</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
