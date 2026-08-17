"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";

const fontHeading = "font-[family-name:var(--font-poppins)]";

type Tournament = {
  id: string;
  name: string;
  status: "upcoming" | "in_progress" | "completed";
  ends_at: string | null;
};

interface LiveBannerProps {
  baseUrl?: string;
}

export default function LiveBanner({ baseUrl = "" }: LiveBannerProps) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const res = await pb.collection("tournaments").getList<Tournament>(1, 1, {
          sort: "-created",
          filter: 'status = "in_progress"',
        });
        if (res.items.length > 0) {
          setTournament(res.items[0]);
        }
      } catch (err) {
        console.error("LiveBanner load error:", err);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!tournament?.ends_at) return;
    const tick = () => {
      const diff = new Date(tournament.ends_at!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00:00");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tournament]);

  useEffect(() => {
    if (!tournament) return;
    let unsub: (() => void) | null = null;
    pb.collection("tournaments").subscribe<Tournament>(tournament.id, (e) => {
      if (e.action === "update") setTournament(e.record);
    }).then((u) => (unsub = u));
    return () => { unsub?.(); };
  }, [tournament]);

  if (!tournament || tournament.status !== "in_progress") return null;

  return (
    <div className={`fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6 ${fontHeading}`}>
      <a
        href={`${baseUrl}results`}
        className="flex items-center gap-3 rounded-full bg-[#0a0f0a]/95 border border-[#c9a227]/30 pl-3 pr-5 py-2.5 shadow-2xl backdrop-blur-sm transition-all hover:border-[#c9a227] hover:scale-[1.02]"
      >
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Live</span>
        </div>
        <div className="h-4 w-px bg-[#1a2e1a]" />
        <div className="text-[13px] font-semibold text-[#f0f0f0]">{tournament.name}</div>
        {timeLeft && (
          <>
            <div className="h-4 w-px bg-[#1a2e1a]" />
            <div className="text-[13px] font-bold tabular-nums text-[#c9a227]">{timeLeft}</div>
          </>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#c9a227]">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </a>
    </div>
  );
}
