"use client";
import { useEffect, useState } from "react";
import ScrollStack, { ScrollStackItem } from "@/components/bits/ScrollStack";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { howItWorksSteps, type Step } from "@/lib/how-it-works";
import { fetchSettings, type PublicSettings } from "@/lib/public-data";
import { useReducedMotion } from "@/lib/use-fx";

// Three cards that stack up as you scroll (window scrolling, no smooth-scroll takeover); a plain list when still.
export function HowItWorks() {
  const still = useReducedMotion();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => alive && setSettings(s)).catch(() => {}); // fees stay "…"
    return () => { alive = false; };
  }, []);
  const steps = howItWorksSteps(settings);
  return (
    <section aria-label="How it works" className="grid gap-4">
      <SectionHeading>How it works</SectionHeading>
      {still ? (
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => <li key={s.n} className="card p-6"><StepBody step={s} /></li>)}
        </ol>
      ) : (
        <ScrollStack useWindowScroll itemDistance={60} itemStackDistance={24} stackPosition="18%" scaleEndPosition="8%" baseScale={0.9} itemScale={0.03}>
          {steps.map((s) => (
            <ScrollStackItem key={s.n} itemClassName="border border-line bg-night-2 text-ghost">
              <StepBody step={s} />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      )}
    </section>
  );
}

function StepBody({ step }: { step: Step }) {
  return (
    <div className="grid gap-3">
      <span className="font-display text-2xl text-pumpkin">Step {step.n}</span>
      <h3 className="flex items-center gap-3 text-2xl font-bold sm:text-3xl"><span aria-hidden>{step.emoji}</span>{step.title}</h3>
      <p className="max-w-2xl text-lg text-muted">{step.body}</p>
    </div>
  );
}
