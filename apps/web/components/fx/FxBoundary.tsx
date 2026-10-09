"use client";
import { Component, type ReactNode } from "react";

// A visual effect that throws (no WebGL context, a driver bug) shows its static fallback instead of breaking the page.
export class FxBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
