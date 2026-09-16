import { describe, expect, it } from "vitest";
import { candidateKind, selectedPairKind, summarizeCandidates } from "./rtc-diagnostic";

describe("rtc diagnostic helpers", () => {
  it("reads candidate kinds and counts them", () => {
    expect(candidateKind("candidate:1 1 udp 2113937151 192.168.1.2 51234 typ host generation 0")).toBe("host");
    expect(candidateKind("candidate:2 1 udp 1677729535 81.2.3.4 51234 typ srflx raddr 0.0.0.0 rport 0")).toBe("srflx");
    expect(candidateKind("candidate:3 1 udp 33562623 141.101.90.1 40000 typ relay raddr 81.2.3.4 rport 51234")).toBe("relay");
    expect(candidateKind("garbage")).toBeNull();
    expect(summarizeCandidates(["a typ host", "b typ host", "c typ relay", "x"])).toEqual({ host: 2, srflx: 0, prflx: 0, relay: 1 });
  });

  it("finds the selected pair through the transport, then falls back to the nominated pair", () => {
    const stats = [
      { id: "T", type: "transport", selectedCandidatePairId: "P1" },
      { id: "P1", type: "candidate-pair", state: "succeeded", localCandidateId: "L1", remoteCandidateId: "R1" },
      { id: "L1", type: "local-candidate", candidateType: "relay" },
      { id: "R1", type: "remote-candidate", candidateType: "host" },
    ];
    expect(selectedPairKind(stats)).toBe("relay");
    const nominated = [
      { id: "P2", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "L2", remoteCandidateId: "R2" },
      { id: "L2", type: "local-candidate", candidateType: "srflx" },
      { id: "R2", type: "remote-candidate", candidateType: "srflx" },
    ];
    expect(selectedPairKind(nominated)).toBe("srflx");
    expect(selectedPairKind([{ id: "P3", type: "candidate-pair", state: "failed", nominated: true }])).toBeNull();
    expect(selectedPairKind([])).toBeNull();
  });
});
