import { Graveyard } from "@/components/Graveyard";
import { Hero } from "@/components/home/Hero";

export default function Home() {
  return (
    <div className="grid gap-24">
      <Hero />
      <Graveyard />
    </div>
  );
}
