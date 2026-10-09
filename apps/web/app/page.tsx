import { Graveyard } from "@/components/Graveyard";
import { Reveal } from "@/components/fx/Reveal";
import { Hero } from "@/components/home/Hero";
import { StatsTicker } from "@/components/home/StatsTicker";

export default function Home() {
  return (
    <div className="grid gap-24">
      <Hero />
      <Reveal><StatsTicker /></Reveal>
      <Graveyard />
    </div>
  );
}
