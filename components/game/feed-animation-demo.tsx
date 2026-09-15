"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedAnimation, type FeedAnimationProps } from "./feed-animation";

/** Dev gallery wrapper: replays the feeding animation on demand. */
export function FeedAnimationDemo(props: Omit<FeedAnimationProps, "onDone">) {
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(false);
  return (
    <div className="space-y-3">
      <FeedAnimation key={run} {...props} onDone={() => setFinished(true)} />
      <Button
        variant="secondary"
        onClick={() => {
          setFinished(false);
          setRun((r) => r + 1);
        }}
      >
        {finished ? "Rejouer l'animation" : "Recommencer"}
      </Button>
    </div>
  );
}
