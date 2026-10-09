"use client";
import { useEffect, useState } from "react";
import ScrollStack, { ScrollStackItem } from "@/components/bits/ScrollStack";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { howItWorksSteps, type Step } from "@/lib/how-it-works";
import { fetchSettings, type PublicSettings } from "@/lib/public-data";
import { useFx } from "@/lib/use-fx";

// A plain list is the default render (server, no JS, reduced motion); once the page is idle and motion is allowed it
// upgrades to cards that stack up as you scroll (window scrolling, no smooth-scroll takeover).
export function HowItWorks() {
  const fx = useFx();
  const stacked = fx.animate && fx.ready;
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => alive && setSettings(s)).catch(() => {}); // fee clauses stay out
    return () => { alive = false; };
  }, []);
  const steps = howItWorksSteps(settings);
  return (
    <section aria-label="How it works" className="grid gap-4">
      <SectionHeading>How it works</SectionHeading>
      {!stacked ? (
        <ol className="grid gap-6">
          {steps.map((s) => <li key={s.n} className="card min-h-64 p-6 sm:p-10"><StepBody step={s} /></li>)}
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
      <h3 className="text-2xl font-bold sm:text-3xl">{step.title}</h3>
      <p className="max-w-2xl text-lg text-muted">{step.body}</p>
    </div>
  );
}
